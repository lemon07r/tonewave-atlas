import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const shots = join(process.env.HOME ?? '', '.local/tmp/tw-shots/redesign/final');
mkdirSync(shots, { recursive: true });

for (const theme of ['light', 'dark'] as const) {
	test.describe(theme, () => {
		test.use({ colorScheme: theme });
		test('compares two real products with attributed rig-labelled curves', async ({ page }, info) => {
			if (info.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await page.goto('/compare');
			const search = page.getByRole('combobox', { name: 'Add to comparison', exact: true });
			for (const name of ['Truthear Hexa', 'Truthear Nova']) {
				await search.fill(name);
				await page
					.getByRole('option')
					.filter({ has: page.locator('.option-title').filter({ hasText: new RegExp(`^${name}$`, 'i') }) })
					.click();
				await expect(
					page.getByTestId('comparison-row').getByRole('heading', { name: new RegExp(`^${name}$`, 'i') })
				).toBeVisible();
			}
			await search.press('Escape');
			await expect(page.getByTestId('comparison-row')).toHaveCount(2);
			for (const row of await page.getByTestId('comparison-row').all()) {
				await expect(row).toContainText('711-family coupler');
				const sources = row.locator('details.sources');
				const disclosure = sources.locator('summary');
				await expect(sources.getByRole('link')).toHaveCount(0);
				await disclosure.press('Enter');
				await expect(sources).toHaveAttribute('open', '');
				const links = await sources.getByRole('link').all();
				expect(links.length).toBeGreaterThan(0);
				await expect(disclosure).toHaveText(
					`${links.length} ${links.length === 1 ? 'reviewer' : 'reviewers'}`
				);
				for (const link of links) {
					await page.keyboard.press('Tab');
					await expect(link).toBeFocused();
					await expect(link).toHaveAttribute('href', /^https?:\/\//);
				}
				await expect.poll(async () => (await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
				await disclosure.press('Enter');
				await expect(sources).not.toHaveAttribute('open', '');
			}
			await search.focus();
			await search.press('Escape');
			await expect(search).toHaveAttribute('aria-expanded', 'false');
			await expect(page.getByRole('button', { name: 'Export chart as PNG' })).toBeEnabled();
			await expect(page).toHaveURL(/[?&]p=p-/);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
			await expect.poll(async () => (await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
			await page.screenshot({ path: join(shots, `pages-compare-${info.project.name}-${theme}.png`) });
			if (info.project.name === 'mobile') {
				await page.locator('.chart').evaluate((element) => {
					element.scrollIntoView({ block: 'start' });
				});
				await page.screenshot({ path: join(shots, `pages-compare-chart-${info.project.name}-${theme}.png`) });
			}
			await page.getByRole('radio', { name: 'Difference', exact: true }).check();
			await expect(page.getByRole('combobox', { name: 'Difference baseline' })).toBeVisible();
			await expect(page).toHaveURL(/[?&]diff=p-/);
			await page.reload();
			await expect(page.getByRole('radio', { name: 'Difference', exact: true })).toBeChecked();
			await expect(page.getByTestId('comparison-row')).toHaveCount(2);
			const measurementChoice = page.getByRole('combobox', {
				name: 'Measurement for Truthear Hexa',
				exact: true
			});
			const measurementId = (await measurementChoice.locator('option').nth(1).getAttribute('value')) ?? '';
			expect(measurementId).toBeTruthy();
			await measurementChoice.selectOption(measurementId);
			await expect.poll(() => new URL(page.url()).searchParams.get('m')).toBe(measurementId);
			await page.reload();
			await expect(
				page.getByRole('combobox', { name: 'Measurement for Truthear Hexa', exact: true })
			).toHaveValue(measurementId);
			await expect(page.getByTestId('comparison-row')).toHaveCount(2);
			await expect.poll(async () => (await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
			expect(errors).toEqual([]);
		});
	});
}

test('headphone comparison labels its measured rig', async ({ page }) => {
	await page.goto('/compare?form=headphones');
	const search = page.getByRole('combobox', { name: 'Add to comparison', exact: true });
	await search.fill('Aune AR9000');
	await page.getByRole('listbox', { name: 'Add to comparison' }).getByRole('option').first().click();
	await expect(page.getByTestId('comparison-row')).toHaveCount(1);
	await expect(page.getByTestId('comparison-row')).toContainText(/5128|Headphone rig|EARS/);
	await expect.poll(async () => (await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('unknown measurement links explain the missing metadata', async ({ page }) => {
	await page.goto('/compare?m=missing-measurement');
	await expect(
		page.getByText('Unknown product or measurement: missing-measurement', { exact: true })
	).toBeVisible();
	await expect.poll(async () => (await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
