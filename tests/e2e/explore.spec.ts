import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const shots = join(process.env.HOME ?? '', '.local/tmp/tw-shots/phase2');
mkdirSync(shots, { recursive: true });

for (const theme of ['light', 'dark'] as const) {
	test.describe(theme, () => {
		test.use({ colorScheme: theme });
		test('filters the real catalog, opens provenance and exports product and reference EQ', async ({
			page
		}, info) => {
			test.setTimeout(60000);
			if (info.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await page.goto('/explore');
			await page.getByRole('searchbox', { name: 'Filter IEMs' }).fill('Truthear Hexa');
			await expect(page.getByRole('link', { name: 'Hexa', exact: true })).toBeVisible();
			await expect(page.locator('.catalog-row')).not.toHaveCount(40);
			await page.getByRole('combobox', { name: 'Brand', exact: true }).selectOption('Truthear');
			const hexa = page
				.locator('.catalog-row')
				.filter({ has: page.getByRole('link', { name: 'Hexa', exact: true }) });
			await expect(hexa).toContainText('711-family coupler');
			await expect(hexa.locator('.prices')).toContainText(/\$\d.* listed by .+, \w{3} \d{4}/);
			const listedPrices = (await hexa.locator('.prices p').allTextContents()).map((text) => text.trim());
			expect(listedPrices.length).toBeGreaterThan(0);
			await expect.poll(async () => (await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
			await page.screenshot({ path: join(shots, `pages-explore-${info.project.name}-${theme}.png`) });
			await page.getByRole('link', { name: 'Hexa', exact: true }).click();
			await expect(page.getByRole('heading', { name: 'Hexa', exact: true })).toBeVisible();
			for (const listing of listedPrices)
				await expect(page.locator('.product-heading')).toContainText(listing);
			await expect(page.getByRole('heading', { name: 'Measurements & provenance' })).toBeVisible();
			await expect(page.getByRole('link', { name: 'Source database', exact: true }).first()).toHaveAttribute(
				'href',
				/^https?:\/\//
			);
			await expect(page.getByRole('link', { name: 'Original file 1', exact: true }).first()).toHaveAttribute(
				'href',
				/^https?:\/\//
			);
			await expect(page.getByRole('link', { name: 'Find similar' })).toHaveAttribute('href', /\?ref=p-/);
			const chart = page.getByRole('figure', { name: 'Truthear Hexa', exact: true });
			await expect(chart.getByRole('button', { name: /1\s*Default consensus/ })).toBeVisible();
			await expect(chart.getByRole('button', { name: 'Export chart as PNG' })).toBeEnabled();
			const measurement = page.locator('.measurements').getByRole('checkbox').first();
			await measurement.check();
			await expect(chart.getByRole('group', { name: 'Chart series' }).getByRole('button')).toHaveCount(2);
			await measurement.uncheck();
			await expect(chart.getByRole('group', { name: 'Chart series' }).getByRole('button')).toHaveCount(1);
			await expect(page.getByText(/DataCloneError/)).toHaveCount(0);
			await page.evaluate(() => {
				window.scrollTo(0, 0);
			});
			await expect.poll(async () => (await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
			await page.screenshot({ path: join(shots, `pages-product-${info.project.name}-${theme}.png`) });
			const target = page.getByRole('combobox', { name: 'EQ target product', exact: true });
			await target.fill('TRUTHEAR NOVA');
			await page
				.getByRole('option')
				.filter({ has: page.locator('.option-title').filter({ hasText: /^TRUTHEAR NOVA$/ }) })
				.click();
			await target.press('Escape');
			const table = page.getByRole('table', { name: 'Parametric EQ filters' });
			await expect(table).toBeVisible();
			expect(await table.getByRole('row').count()).toBeGreaterThan(1);
			const frequencies = await table.locator('tbody tr td:nth-child(3)').allTextContents();
			for (const frequency of frequencies) expect(frequency).toMatch(/^\d+$/);
			const hertz = frequencies.map(Number);
			expect(hertz).toEqual([...hertz].sort((a, b) => a - b));
			for (const gain of await table.locator('tbody tr td:nth-child(5)').allTextContents()) {
				expect(gain).toMatch(/^[+−]\d+\.\d$/);
			}
			expect(
				await table.locator('th:nth-child(n + 3), td:nth-child(n + 3)').evaluateAll((cells) =>
					cells.every((cell) => {
						const style = getComputedStyle(cell);
						return style.textAlign === 'right' && style.fontVariantNumeric.includes('tabular-nums');
					})
				)
			).toBe(true);
			await expect(page.getByText(/Response distance, 20 Hz–10 kHz:/)).toContainText(
				/Preamp: [+−]\d+\.\d dB/
			);
			const downloadPromise = page.waitForEvent('download');
			await page.getByRole('button', { name: 'Download Equalizer APO', exact: true }).click();
			const download = await downloadPromise;
			expect(download.suggestedFilename()).toMatch(/^tonewave-p-.*-eq\.txt$/);
			const stream = await download.createReadStream();
			const chunks: Buffer[] = [];
			for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
			const apo = Buffer.concat(chunks).toString();
			expect(apo).toMatch(/Preamp:.*dB[\s\S]*Filter 1: ON/);
			expect(apo).not.toContain('−');
			await expect.poll(async () => (await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
			await page.locator('.eq').scrollIntoViewIfNeeded();
			await page.screenshot({ path: join(shots, `pages-eq-${info.project.name}-${theme}.png`) });
			await page
				.getByRole('figure', { name: 'Original, target and EQ approximation' })
				.evaluate((element) => {
					element.scrollIntoView({ block: 'start' });
				});
			await page.screenshot({ path: join(shots, `pages-eq-chart-${info.project.name}-${theme}.png`) });
			const reference = page.getByRole('combobox', { name: 'EQ reference target', exact: true });
			await expect(reference.getByRole('option', { name: 'Harman in-ear 2019', exact: true })).toHaveCount(1);
			await expect(reference.getByRole('option', { name: 'Diffuse field 5128', exact: true })).toHaveCount(0);
			await reference.selectOption('harman-in-ear-2019');
			await expect(page.locator('.reference-attribution')).toContainText('Harman in-ear 2019');
			await expect(page.locator('.reference-attribution')).toContainText('Olive');
			await expect(page.locator('.reference-attribution a')).toHaveAttribute('href', /AutoEq\/blob\//);
			await expect(table).toBeVisible();
			expect(await table.getByRole('row').count()).toBeGreaterThan(1);
			await expect(page.getByText(/Response distance, 20 Hz–10 kHz:/)).toContainText(
				/dB before → \d+\.\d dB after/
			);
			await expect.poll(async () => (await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
			expect(errors).toEqual([]);
		});
	});
}

test('headphone catalog states its limited coverage and opens real measurements', async ({ page }) => {
	await page.goto('/explore?form=headphones');
	await expect(page.getByText('A small headphone dataset', { exact: true })).toBeVisible();
	await expect(page.locator('.catalog-row').first()).toBeVisible();
	await page.locator('.catalog-row').first().getByRole('link').click();
	await expect(page.getByRole('heading', { name: 'Measurements & provenance' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Source database', exact: true }).first()).toBeVisible();
	await expect(page).toHaveURL(/form=headphones/);
	await expect.poll(async () => (await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
