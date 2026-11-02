import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Catalog, Manifest } from '../../src/core/dataset/types.ts';

const shots = join(process.env.HOME ?? '', '.local/tmp/tw-shots/redesign/final');
mkdirSync(shots, { recursive: true });
const manifest = JSON.parse(readFileSync('static/data/manifest.json', 'utf8')) as Manifest;
const catalog = JSON.parse(
	gunzipSync(readFileSync(`static/data/${manifest.version}/catalog-iem.json.gz`)).toString()
) as Catalog;
const current = catalog.partitions.find((partition) => partition.id === 'iem-711')?.statistics?.harmonisation;
if (!current || current.meanBefore === null || current.meanAfter === null)
	throw new Error('Real dataset validation metadata is required.');
const pairCount = current.pairs.toLocaleString('en-US');
const meanDistance = `${current.meanBefore.toFixed(3)} dB → ${current.meanAfter.toFixed(3)} dB`;

for (const theme of ['light', 'dark'] as const) {
	test.describe(theme, () => {
		test.use({ colorScheme: theme });
		test('attributes the real dataset and explains its limitations', async ({ page }, info) => {
			if (info.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
			await page.goto('/method');
			const table = page.getByRole('table', { name: 'Measurement data sources' });
			await expect(table).toBeVisible();
			expect(await table.getByRole('row').count()).toBeGreaterThan(1);
			const counts = await table.locator('tbody tr td:nth-child(3)').allTextContents();
			for (const count of counts) expect(count).toMatch(/^\d+$/);
			expect(counts.some((count) => Number(count) > 0)).toBe(true);
			await expect(table.getByRole('link').first()).toHaveAttribute('href', /^https?:\/\//);
			await expect(table).toContainText('public, not explicitly licensed');
			await expect(page.locator('#sources > .small.mono')).toContainText(/Built \d{4}-\d{2}-\d{2}/);
			const validation = page.getByRole('region', { name: 'iem-711 validation', exact: true });
			await expect(validation).toContainText(pairCount);
			await expect(validation).toContainText(meanDistance);
			await expect(page.getByRole('link', { name: 'open a GitHub issue' })).toHaveAttribute(
				'href',
				'https://github.com/lemon07r/tonewave-atlas/issues'
			);
			const sourceRegion = page.getByRole('region', { name: 'Scrollable measurement sources' });
			await sourceRegion.focus();
			await expect(sourceRegion).toBeFocused();
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
			await page.evaluate(() => {
				window.scrollTo(0, 0);
			});
			await expect.poll(async () => (await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
			await page.screenshot({ path: join(shots, `pages-method-${info.project.name}-${theme}.png`) });
			await page.locator('#sources').evaluate((element) => {
				element.scrollIntoView({ block: 'start' });
			});
			await page.screenshot({ path: join(shots, `pages-sources-${info.project.name}-${theme}.png`) });
		});
	});
}

test('headphone mode attributes only headphone sources', async ({ page }) => {
	await page.goto('/method?form=headphones');
	const table = page.getByRole('table', { name: 'Measurement data sources' });
	await expect(table).toBeVisible();
	await expect(table).toContainText('headphone-');
	await expect(table).not.toContainText('iem-711');
	await expect.poll(async () => (await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
