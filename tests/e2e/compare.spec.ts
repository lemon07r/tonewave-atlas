import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const shots = join(process.env.HOME ?? '', '.local/tmp/tw-shots/phase2');
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
					.filter({ has: page.getByText(name, { exact: true }) })
					.click();
				await expect(
					page.getByTestId('comparison-row').getByRole('heading', { name, exact: true })
				).toBeVisible();
			}
			await search.press('Escape');
			await expect(page.getByTestId('comparison-row')).toHaveCount(2);
			for (const row of await page.getByTestId('comparison-row').all()) {
				await expect(row).toContainText('711-family');
				await expect(row.getByRole('link').first()).toHaveAttribute('href', /^https?:\/\//);
			}
			await expect(page.getByRole('button', { name: 'Export chart as PNG' })).toBeEnabled();
			await expect(page).toHaveURL(/[?&]p=p-/);
			await expect.poll(async () => (await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
			await page.screenshot({ path: join(shots, `pages-compare-${info.project.name}-${theme}.png`) });
			await page.getByRole('radio', { name: 'Difference', exact: true }).check();
			await expect(page.getByRole('combobox', { name: 'Difference baseline' })).toBeVisible();
			await expect(page).toHaveURL(/[?&]diff=p-/);
			await page.reload();
			await expect(page.getByRole('radio', { name: 'Difference', exact: true })).toBeChecked();
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
