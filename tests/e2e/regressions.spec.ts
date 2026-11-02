import { expect, test } from '@playwright/test';

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
	await page.goto(`/?ref=${reference}&rig=iem-5128`);
	await expect(page.locator('.result-row')).toHaveCount(20);
	await page.locator('.workspace-tools > summary').click();
	await page.getByRole('combobox', { name: 'Upload measurement rig' }).selectOption('iem-711');
	await page.getByLabel('Local reference measurement', { exact: true }).setInputFiles(fixture);
	await expect(page.locator('.results > .distance-note').first()).toContainText('711-family coupler');
	await page.locator('.refine > summary').click();
	const rig = page.getByRole('combobox', { name: 'Measurement rig', exact: true });
	if (await rig.isEnabled()) await rig.selectOption('iem-5128');
	await expect(page.locator('.results > .distance-note').first()).toContainText('711-family coupler');
	await expect(rig).toBeDisabled();
	await expect(page.getByText(/Rig is locked to your upload/)).toBeVisible();
});

test('source-only reviewer Reset returns to coverage atomically instead of failing the query', async ({
	page
}) => {
	await page.goto(`/?ref=${reference}&rig=iem-711&sources=aden-iems-f0687e07&sourceMode=only`);
	await expect(page.locator('.result-row')).toHaveCount(20);
	await page.locator('.refine > summary').click();
	await page.getByRole('button', { name: 'Reset reviewers', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Measured matches', exact: true })).toHaveAttribute(
		'aria-busy',
		'false'
	);
	await expect(page.locator('.result-row')).toHaveCount(20);
	await expect(page.getByRole('combobox', { name: 'Reviewer scoring mode' })).toHaveValue('coverage');
	await expect(page.locator('option[value="only"]')).toHaveJSProperty('disabled', true);
	await expect(page).not.toHaveURL(/sourceMode=only/);
});

test('reviewer changes clear serialised corrections belonging to the old taste model', async ({ page }) => {
	await page.goto(
		shared([like(reference)], { view: 'taste', edits: JSON.stringify([{ tasteId: 0, bands: { bass: 2 } }]) })
	);
	await expect(page.locator('.result-row')).toHaveCount(20);
	await page.locator('.refine > summary').click();
	await page.getByRole('searchbox', { name: 'Search reviewers' }).fill('aden');
	await page.locator('.source-options').getByRole('checkbox', { name: 'aden', exact: true }).check();
	await expect(page).not.toHaveURL(/edits=/);
});

test('an unknown Neutral product does not block a valid Like', async ({ page }) => {
	await page.goto(shared([like(reference), { ...like('unknown-neutral'), rating: 'neutral', strength: 0 }]));
	await expect(page.locator('.result-row')).toHaveCount(20);
	await expect(page.locator('.results')).not.toContainText(
		'A rated reference is not in this form-factor catalog'
	);
});

test('pending results retain their returned reference headings, evidence and Compare links', async ({
	page
}) => {
	await page.addInitScript(() => {
		// eslint-disable-next-line @typescript-eslint/unbound-method -- invoked with the original Worker receiver via .call below.
		const post = Worker.prototype.postMessage;
		Worker.prototype.postMessage = function (
			message: unknown,
			transfer?: Transferable[] | StructuredSerializeOptions
		) {
			const options = Array.isArray(transfer) ? { transfer } : transfer;
			const path = message && typeof message === 'object' && 'path' in message ? message.path : [];
			const delay =
				document.documentElement.dataset.delayQueries === 'true' &&
				Array.isArray(path) &&
				['similar', 'compare', 'taste'].includes(String(path[0]));
			if (delay)
				window.setTimeout(() => {
					post.call(this, message, options);
				}, 1500);
			else post.call(this, message, options);
		};
	});
	await page.goto(shared([like(reference), like(volume), like(nova)]));
	await expect(page.locator('.result-row')).toHaveCount(20);
	await page.evaluate(() => {
		document.documentElement.dataset.delayQueries = 'true';
	});
	await page.getByRole('button', { name: 'Remove Softears Volume S', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Measured matches', exact: true })).toHaveAttribute(
		'aria-busy',
		'true'
	);
	const first = page.locator('.result-row').first();
	await expect(first.getByRole('columnheader', { name: /Softears Volume S/ })).toBeVisible({ timeout: 1000 });
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
	await expect(page.getByRole('region', { name: 'Measured matches', exact: true })).toHaveAttribute(
		'aria-busy',
		'false'
	);
	await expect(first.getByRole('columnheader', { name: /Softears Volume S/ })).toHaveCount(0);
});
