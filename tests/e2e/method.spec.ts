import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const shots = join(process.env.HOME ?? '', '.local/tmp/tw-shots/phase2');
mkdirSync(shots, { recursive: true });

for (const theme of ['light', 'dark'] as const) {
	test.describe(theme, () => {
		test.use({ colorScheme: theme });
		test('attributes the real dataset and explains its limitations', async ({ page }, info) => {
			if (info.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
			await page.goto('/method');
			const table = page.getByRole('table', { name: 'Measurement data sources' });
			await expect(table).toBeVisible();
			expect(await table.getByRole('row').count()).toBeGreaterThan(1);
			await expect(table.getByRole('link').first()).toHaveAttribute('href', /^https?:\/\//);
			await expect(table).toContainText('public, not explicitly licensed');
			await expect(page.getByText(/^Dataset /)).toContainText(/Built \d{4}-\d{2}-\d{2}/);
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
