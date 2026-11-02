import { expect, test } from '@playwright/test';
import { productOnRigs, reviewerForReference } from './catalog.ts';

const reference = 'p-437de4e3e3402077cdc3';
const volume = 'p-9104c8bb39d66e906811';
const nova = 'p-1b241163b22023defb6f';
const like = (productId: string) => ({ productId, rating: 'like', strength: 0.6, soundRelated: true });
const shared = (items: unknown[], extra: Record<string, string> = {}) =>
	`/?${new URLSearchParams({ rig: 'iem-711', ratings: JSON.stringify(items), ...extra })}`;
const fixture = {
	name: 'declared-711.txt',
	mimeType: 'text/plain',
	buffer: Buffer.from(
		Array.from({ length: 240 }, (_, i) => `${20 * 2 ** (i / 24)} ${Math.sin(i / 30)}`).join('\n')
	)
};

test('upload requests keep the declared rig and lock the independent discovery rig', async ({ page }) => {
	const uploadReference = productOnRigs(['iem-711', 'iem-5128']);
	await page.goto(`/?ref=${uploadReference.id}&rig=iem-5128`);
	await expect(page.locator('.result-row')).toHaveCount(20);
	await expect(page.locator('.results > .distance-note').first()).toContainText('B&K 5128');
	await page.locator('.workspace-tools > summary').click();
	await page.getByRole('combobox', { name: 'Upload measurement rig' }).selectOption('iem-711');
	await page.getByLabel('Local reference measurement', { exact: true }).setInputFiles(fixture);
	await expect(page.getByText(`Local reference: ${fixture.name}`, { exact: true })).toBeVisible();
	await expect(page.locator('.results > .distance-note').first()).toContainText('711-family coupler');
	await expect(page.getByRole('region', { name: 'Measured matches', exact: true })).toHaveAttribute(
		'aria-busy',
		'false'
	);
	await expect(page.locator('.result-row')).toHaveCount(20);
	await page.locator('.refine > summary').click();
	const rig = page.getByRole('combobox', { name: 'Measurement rig', exact: true });
	if (await rig.isEnabled()) await rig.selectOption('iem-5128');
	await expect(page.locator('.results > .distance-note').first()).toContainText('711-family coupler');
	await expect(rig).toBeDisabled();
	await expect(rig).toHaveValue('iem-711');
	await expect(page.getByText(/Rig is locked to your upload/)).toBeVisible();
	expect(new URL(page.url()).searchParams.get('rig')).toBe('iem-5128');
	await page.getByRole('button', { name: 'Remove local reference', exact: true }).click();
	await expect(rig).toHaveValue('iem-5128');
	await expect(rig).toBeEnabled();
	await expect(page.locator('.results > .distance-note').first()).toContainText('B&K 5128');
});

test('source-only reviewer Reset returns to coverage atomically instead of failing the query', async ({
	page
}) => {
	const reviewer = reviewerForReference(reference);
	await page.goto(
		`/?${new URLSearchParams({ ref: reference, rig: reviewer.selectedPartition, sources: reviewer.id, sourceMode: 'only' })}`
	);
	await expect(page.locator('.result-row')).toHaveCount(20);
	await page.locator('.refine > summary').click();
	await expect(page.getByRole('combobox', { name: 'Reviewer scoring mode' })).toHaveValue('only');
	await expect(page.locator('.result-row').first().locator('.sources a')).toHaveText([
		`${reviewer.name} database`
	]);
	await page.getByRole('button', { name: 'Reset reviewers', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Measured matches', exact: true })).toHaveAttribute(
		'aria-busy',
		'false'
	);
	await expect(page.locator('.result-row')).toHaveCount(20);
	await expect(page.getByRole('combobox', { name: 'Reviewer scoring mode' })).toHaveValue('coverage');
	await expect(page.locator('option[value="only"]')).toHaveJSProperty('disabled', true);
	await expect(page).not.toHaveURL(/sourceMode=only/);
	await expect(page).not.toHaveURL(/sources=/);
});

test('reviewer changes clear serialised corrections belonging to the old taste model', async ({ page }) => {
	const reviewer = reviewerForReference(reference);
	await page.goto(
		shared([like(reference)], { view: 'taste', edits: JSON.stringify([{ tasteId: 0, bands: { bass: 2 } }]) })
	);
	await expect(page.locator('.result-row')).toHaveCount(20);
	await page.locator('.refine > summary').click();
	await expect(page).toHaveURL(/edits=/);
	await page.getByRole('searchbox', { name: 'Search reviewers' }).fill(reviewer.name);
	await page.locator('.source-options').getByRole('checkbox', { name: reviewer.name, exact: true }).check();
	await expect(page).not.toHaveURL(/edits=/);
	await expect.poll(() => new URL(page.url()).searchParams.get('sources')).toBe(reviewer.id);
	await expect(page.getByRole('region', { name: 'Measured matches', exact: true })).toHaveAttribute(
		'aria-busy',
		'false'
	);
	await expect(page.locator('.result-row')).toHaveCount(20);
});

test('an unknown Neutral product does not block a valid Like', async ({ page }) => {
	await page.goto(shared([like(reference), { ...like('unknown-neutral'), rating: 'neutral', strength: 0 }]));
	await expect(page.locator('.result-row')).toHaveCount(20);
	await expect(page.locator('.results')).not.toContainText(
		'A rated reference is not in this form-factor catalog'
	);
});

test('a chart selection below the first page survives reload and sharing', async ({ page, context }) => {
	await page.goto(shared([like(reference)]));
	await expect(page.locator('.result-row')).toHaveCount(20);
	await page.getByRole('button', { name: 'Show more matches', exact: true }).click();
	await expect(page.locator('.result-row')).toHaveCount(40);
	await page
		.locator('.result-row')
		.nth(25)
		.getByRole('button', { name: 'Show on chart', exact: true })
		.click();
	await expect(page).toHaveURL(/chart=/);
	const url = page.url();
	for (const target of [page, await context.newPage()]) {
		await target.goto(url);
		await expect(target.locator('.result-row')).toHaveCount(40);
		await expect(
			target.locator('.result-row').nth(25).getByRole('button', { name: 'Remove from chart', exact: true })
		).toBeVisible();
		await expect(target.locator('.legend-row')).toHaveCount(2);
	}
});

test('form switches retain shared workspaces and clear Compare selections', async ({ page }) => {
	await page.goto(shared([like(reference)]));
	async function switchForm(name: 'Headphones' | 'IEMs') {
		const desktop = page.getByRole('group', { name: 'Form factor', exact: true });
		const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
		// Tablet has a navigation menu but keeps the desktop form controls visible.
		const mobile = !(await desktop.isVisible());
		if (mobile && (await menu.isVisible())) await menu.click();
		await page
			.getByRole('group', { name: mobile ? 'Mobile form factor' : 'Form factor', exact: true })
			.getByRole('radio', { name, exact: true })
			.check();
	}
	await expect(page.locator('.result-row')).toHaveCount(20);
	await switchForm('Headphones');
	await expect(page.locator('.profile-row')).toHaveCount(0);
	await switchForm('IEMs');
	await expect(page.locator('.profile-row')).toContainText('CrinEar Reference');
	await expect(page.locator('.result-row')).toHaveCount(20);
	await page.goto(`/compare?p=${reference},${volume}`);
	await expect(page.getByTestId('comparison-row')).toHaveCount(2);
	await switchForm('Headphones');
	await expect(page.getByTestId('comparison-row')).toHaveCount(0);
	await expect(page).not.toHaveURL(/[?&]p=/);
});

test('Undo after a shared workspace edit restores the saved profile rather than the shared one', async ({
	page
}) => {
	await page.addInitScript(
		({ volume }) => {
			localStorage.setItem(
				'tonewave.profile.v1',
				JSON.stringify({
					version: 2,
					profiles: {
						iem: [{ productId: volume, rating: 'like', strength: 0.6, soundRelated: true }],
						headphone: []
					}
				})
			);
		},
		{ volume }
	);
	await page.goto(shared([like(reference)]));
	await expect(page.locator('.profile-row')).toContainText('CrinEar Reference');
	await page.getByRole('button', { name: 'Clear all', exact: true }).click();
	await expect(page.locator('.profile-row')).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.locator('.profile-row')).toContainText('Softears Volume S');
	expect(await page.evaluate(() => localStorage.getItem('tonewave.profile.v1'))).toContain(volume);
});

test('pending results retain their returned reference headings, evidence and Compare links', async ({
	page
}) => {
	await page.addInitScript(() => {
		const pending: (() => void)[] = [];
		Object.assign(window, {
			discoveryQueries: {
				pending,
				release: () => {
					document.documentElement.dataset.delayQueries = 'false';
					for (const send of pending.splice(0)) send();
				}
			}
		});
		// The service returned by create() is a Comlink proxy on a transferred port.
		// eslint-disable-next-line @typescript-eslint/unbound-method -- invoked with the original MessagePort receiver via .call below.
		const post = MessagePort.prototype.postMessage;
		MessagePort.prototype.postMessage = function (
			message: unknown,
			transfer?: Transferable[] | StructuredSerializeOptions
		) {
			const options = Array.isArray(transfer) ? { transfer } : transfer;
			const path = message && typeof message === 'object' && 'path' in message ? message.path : [];
			const delay =
				document.documentElement.dataset.delayQueries === 'true' &&
				Array.isArray(path) &&
				['similar', 'compare', 'taste'].includes(String(path[0]));
			// Hold the real request until the pending-state assertions finish, rather
			// than racing the browser's actions against a fixed timeout.
			if (delay)
				pending.push(() => {
					post.call(this, message, options);
				});
			else post.call(this, message, options);
		};
	});
	await page.goto(shared([like(reference), like(volume), like(nova)]));
	await expect(page.locator('.result-row')).toHaveCount(20);
	const results = page.getByRole('region', { name: 'Measured matches', exact: true });
	await expect(results).toHaveAttribute('aria-busy', 'false');
	await page.evaluate(() => {
		document.documentElement.dataset.delayQueries = 'true';
	});
	await page.getByRole('button', { name: 'Remove Softears Volume S', exact: true }).click();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { discoveryQueries: { pending: unknown[] } }).discoveryQueries.pending.length
			)
		)
		.toBeGreaterThan(0);
	await expect(results).toHaveAttribute('aria-busy', 'true');
	const first = page.locator('.result-row').first();
	await expect(first.getByRole('columnheader', { name: /Softears Volume S/ })).toBeVisible();
	await expect(first.getByRole('link', { name: 'Compare', exact: true })).toHaveAttribute(
		'href',
		new RegExp(volume)
	);
	await first.locator('details:not(.rate-row) > summary').click();
	await expect(
		first.getByRole('table', {
			name: 'Candidate minus Softears Volume S, after independent level alignment',
			exact: true
		})
	).toBeVisible();
	await expect(results).toHaveAttribute('aria-busy', 'true');
	await page.evaluate(() => {
		(window as unknown as { discoveryQueries: { release: () => void } }).discoveryQueries.release();
	});
	await expect(results).toHaveAttribute('aria-busy', 'false');
	await expect(first.getByRole('columnheader', { name: /Softears Volume S/ })).toHaveCount(0);
});
