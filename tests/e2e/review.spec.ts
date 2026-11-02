import { gunzipSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { Catalog } from '../../src/core/dataset/types.ts';

const hexa = 'p-19d1654fcb150bf1aa2f';
const uploadFile = {
	name: 'local.txt',
	mimeType: 'text/plain',
	buffer: Buffer.from(
		Array.from({ length: 240 }, (_, i) => `${20 * 2 ** (i / 24)} ${Math.sin(i / 30)}`).join('\n')
	)
};

async function accessible(page: Page) {
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

test('uploads recover, accept the same file again and retain local baselines across controls and forms', async ({
	page
}) => {
	await page.goto('/compare');
	const input = page.getByLabel('Add your own measurement', { exact: true });
	await input.setInputFiles({
		name: 'bad.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('not a measurement')
	});
	await expect(page.getByText('Could not add upload', { exact: true })).toBeVisible();
	await input.setInputFiles(uploadFile);
	await expect(page.getByRole('heading', { name: 'Your upload: local.txt', exact: true })).toHaveCount(1);
	await expect(page.getByText('Could not add upload', { exact: true })).toHaveCount(0);
	await expect(input).toHaveValue('');
	await page.getByRole('button', { name: 'Remove upload', exact: true }).click();
	await input.setInputFiles(uploadFile);
	await expect(page.getByRole('heading', { name: 'Your upload: local.txt', exact: true })).toHaveCount(1);
	await input.setInputFiles({ ...uploadFile, name: 'second.txt' });
	await expect(page.getByRole('heading', { name: 'Your upload: second.txt', exact: true })).toBeVisible();
	await page.getByRole('radio', { name: 'Difference', exact: true }).check();
	const baseline = page.getByRole('combobox', { name: 'Difference baseline', exact: true });
	await baseline.selectOption({ label: 'Your upload: second.txt' });
	const baselineId = await baseline.inputValue();
	await page.getByLabel('Display smoothing', { exact: true }).selectOption('6');
	await page.getByRole('radio', { name: 'Left', exact: true }).check();
	await expect(baseline).toHaveValue(baselineId);
	await expect(page.getByRole('radio', { name: 'Difference', exact: true })).toBeChecked();
	const navigation = page.getByRole('button', { name: 'Open navigation', exact: true });
	if (await navigation.isVisible()) await navigation.click();
	await page.getByRole('radio', { name: 'Headphones', exact: true }).check();
	await expect(page.getByRole('heading', { name: /^Your upload:/ })).toHaveCount(2);
	await expect(baseline).toHaveValue(baselineId);
	await accessible(page);
});

test('two pending uploads cannot overfill the six-curve selection', async ({ page }) => {
	await page.goto('/compare');
	const input = page.getByLabel('Add your own measurement', { exact: true });
	for (let i = 0; i < 5; i++) {
		await input.setInputFiles({ ...uploadFile, name: `initial-${i}.txt` });
		await expect(page.getByRole('button', { name: 'Remove upload', exact: true })).toHaveCount(i + 1);
	}
	// Delay real File.text reads, rather than replacing parsing or analysis results.
	await page.evaluate(() => {
		const pending: (() => void)[] = [];
		File.prototype.text = async function () {
			const text = await Blob.prototype.text.call(this);
			await new Promise<void>((resolve) => pending.push(resolve));
			return text;
		};
		Object.assign(window, {
			uploadReads: {
				pending,
				release: () => {
					pending.forEach((resolve) => {
						resolve();
					});
					Reflect.deleteProperty(File.prototype, 'text');
				}
			}
		});
	});
	await input.setInputFiles({ ...uploadFile, name: 'pending-one.txt' });
	await input.setInputFiles({ ...uploadFile, name: 'pending-two.txt' });
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as { uploadReads: { pending: unknown[] } }).uploadReads.pending.length
			)
		)
		.toBe(2);
	await page.evaluate(() => {
		(window as unknown as { uploadReads: { release: () => void } }).uploadReads.release();
	});
	await expect(
		page.getByText('Six curves selected. Remove one before adding this upload.', { exact: true })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Remove upload', exact: true })).toHaveCount(6);
	await expect(input).toBeDisabled();
	await accessible(page);
});

test('a product without defaults retains its measurement selector and remove action', async ({ page }) => {
	await page.route('**/catalog-iem.json.gz', async (route) => {
		const response = await route.fetch();
		const bytes = await response.body();
		const catalog = JSON.parse(
			(bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString()
		) as Catalog;
		for (const measurement of catalog.measurements.filter((m) => m.productId === hexa)) {
			measurement.variant.kind = 'fit';
			measurement.variant.isDefault = false;
		}
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) });
	});
	await page.goto(`/compare?p=${hexa}`);
	const row = page.getByTestId('comparison-row');
	await expect(row).toBeVisible();
	await expect(row).toContainText('no avg default consensus is available');
	const measurement = row.getByRole('combobox', { name: 'Measurement for Truthear Hexa', exact: true });
	const id = await measurement.locator('option').nth(1).getAttribute('value');
	expect(id).toBeTruthy();
	if (!id) throw new Error('Fixture measurement is missing');
	await measurement.selectOption(id);
	await expect(row).not.toContainText('no avg default consensus is available');
	await expect(
		page.getByRole('group', { name: 'Chart series', exact: true }).getByRole('button')
	).toHaveCount(1);
	await accessible(page);
	await row.getByRole('button', { name: 'Remove Truthear Hexa', exact: true }).click();
	await expect(row).toHaveCount(0);
});

test('Discover rejects a known IEM reference in headphone mode', async ({ page }) => {
	await page.goto(`/?ref=${hexa}&form=headphones`);
	await expect(
		page.getByText('A rated reference is not in this form-factor catalog. Remove it or switch form factor.', {
			exact: true
		})
	).toBeVisible();
	await expect(page.locator('.result-row')).toHaveCount(0);
	await expect(page.getByRole('combobox', { name: 'Reference measurement', exact: true })).toHaveCount(0);
	await accessible(page);
});

test('one unavailable selected channel does not erase the product consensus', async ({ page }) => {
	await page.goto(`/explore?product=${hexa}`);
	const measurement = page
		.locator('.measurement')
		.filter({ has: page.getByText('Channels: R', { exact: true }) })
		.first();
	await measurement.getByRole('checkbox').check();
	const legend = page.getByRole('group', { name: 'Chart series', exact: true }).first();
	await expect(legend.getByRole('button')).toHaveCount(2);
	await page.getByRole('radio', { name: 'Left', exact: true }).check();
	await expect(page.getByText(/L channel unavailable\./)).toBeVisible();
	await expect(legend.getByRole('button')).toHaveCount(1);
	await expect(legend).toContainText('Default consensus');
	await accessible(page);
});

test('optional target failure does not hide Method source attribution', async ({ page }) => {
	await page.route('**/targets.json.gz', (route) => route.abort());
	await page.goto('/method');
	await expect(page.getByText('Reference targets unavailable', { exact: true })).toBeVisible();
	await expect(page.getByRole('table', { name: 'Measurement data sources', exact: true })).toBeVisible();
	await expect(
		page.getByText('No published reference targets for this form factor.', { exact: true })
	).toHaveCount(0);
	await accessible(page);
});

test('Discover clears source filters on rig changes and keeps taste corrections rig-local', async ({
	page
}) => {
	const vulkan = 'p-03b003b753f77550fdc9';
	await page.goto(`/?ref=${vulkan}&rig=iem-711`);
	await expect(page.locator('.result-row').first()).toBeVisible();
	await page.locator('.refine > summary').click();
	await page.locator('.source-filter').getByRole('checkbox').first().check();
	await expect(page).toHaveURL(/sources=/);
	await page.getByRole('combobox', { name: 'Measurement rig', exact: true }).selectOption('iem-5128');
	await expect(page).not.toHaveURL(/sources=/);
	await expect(page.locator('.results > .distance-note').first()).toContainText('B&K 5128');
	// Legacy taste URLs still restore the same explicit reference as a saved Like.
	await page.goto(
		`/?mode=profile&ratings=${encodeURIComponent(JSON.stringify([{ productId: vulkan, rating: 'like', strength: 0.6, soundRelated: true }]))}&rig=iem-711`
	);
	await expect(page.locator('.model > summary')).toHaveText('Taste model · 1 centre · limited support');
	await page.locator('.refine > summary').click();
	await page.locator('.controls > details > summary').click();
	const rig = page.getByRole('combobox', { name: 'Measurement rig', exact: true });
	await rig.selectOption('iem-711');
	const correction = page.getByRole('slider', { name: 'Taste 1 bass', exact: true });
	await expect(correction).toHaveValue('0');
	await correction.press('ArrowRight');
	await expect(correction).toHaveValue('0.5');
	await page.locator('.source-filter').getByRole('checkbox').first().check();
	await expect(page).toHaveURL(/sources=/);
	await rig.selectOption('iem-5128');
	await expect(page).not.toHaveURL(/sources=/);
	await expect(correction).toHaveValue('0');
	await rig.selectOption('iem-711');
	await expect(correction).toHaveValue('0.5');
	await expect(page).toHaveURL(/edits=/);
	await page.reload();
	await page.locator('.refine > summary').click();
	await page.locator('.controls > details > summary').click();
	await expect(correction).toHaveValue('0.5');
	await accessible(page);
});

test('the profile editor cannot exceed its import limit', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem(
			'tonewave.profile.v1',
			JSON.stringify({
				version: 1,
				profiles: {
					iem: Array.from({ length: 200 }, (_, i) => ({
						productId: `fixture-${i}`,
						rating: 'neutral',
						strength: 0,
						soundRelated: false
					})),
					headphone: []
				}
			})
		);
	});
	await page.goto('/?mode=profile');
	await page.getByRole('combobox', { name: 'Add an IEM', exact: true }).fill('Truthear Hexa');
	await page
		.getByRole('option')
		.filter({ has: page.locator('.option-title').filter({ hasText: /^Truthear Hexa$/ }) })
		.click();
	await expect(
		page.getByText(
			'A profile supports at most 200 products per form factor. Remove one before adding another.',
			{ exact: true }
		)
	).toBeVisible();
	expect(
		await page.evaluate(() => JSON.parse(localStorage.getItem('tonewave.profile.v1') ?? '{}') as unknown)
	).toMatchObject({
		profiles: {
			iem: expect.arrayContaining([
				{ productId: 'fixture-199', rating: 'neutral', strength: 0, soundRelated: false }
			])
		}
	});
	expect(await page.getByRole('region', { name: 'Truthear Hexa', exact: true }).count()).toBe(0);
	await accessible(page);
});
