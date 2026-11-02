import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function pick(page: Page, searchLabel: string, model: string) {
	await page.getByRole('combobox', { name: searchLabel, exact: true }).fill(model);
	await page.getByRole('option', { name: new RegExp(`^${model} `) }).click();
}
async function accessible(page: Page) {
	const report = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
		.analyze();
	expect(report.violations).toEqual([]);
	expect(report.incomplete.filter((issue) => issue.id === 'aria-prohibited-attr')).toEqual([]);
}

test('real similar search, dB explanations, overlays, URL controls and reload', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/');
	await pick(page, 'An IEM you enjoy', 'Truthear Hexa');
	const first = page.locator('.result-row').first();
	await expect(first).toBeVisible();
	await expect(first.locator('.distance')).toHaveText(/Response distance:\s\d+\.\d\sdB/);
	await expect(page.locator('.results .section-heading .eyebrow')).toHaveText('711-family coupler');
	await expect(page).toHaveURL(/ref=p-/);
	await first.getByRole('button', { name: 'Show on chart', exact: true }).click();
	await expect(page.locator('.legend-row')).toHaveCount(2);
	const headerJump = page.locator('.results > .section-heading > .chart-jump');
	const rowJump = first.locator('.actions > .chart-jump');
	await expect(headerJump).toHaveCount(1);
	await expect(rowJump).toHaveCount(1);
	if ((page.viewportSize()?.width ?? 0) <= 900) {
		await expect(headerJump).toBeVisible();
		await expect(rowJump).toBeVisible();
		await rowJump.click();
		await expect(page).toHaveURL(/#discover-chart$/);
		await expect(page.getByRole('complementary', { name: 'Reference and match chart' })).toBeInViewport();
	} else {
		await expect(headerJump).toBeHidden();
		await expect(rowJump).toBeHidden();
	}
	await expect(page).toHaveURL(/chart=/);
	await page.getByRole('radio', { name: 'Bass', exact: true }).check();
	await expect(page).toHaveURL(/focus=bass/);
	await expect(page.getByRole('region', { name: 'Measured matches', exact: true })).toHaveAttribute(
		'aria-busy',
		'false'
	);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Truthear Hexa', exact: true })).toBeVisible();
	await expect(page.getByRole('radio', { name: 'Bass', exact: true })).toBeChecked();
	await expect(page.locator('.legend-row')).toHaveCount(2);
	await page.getByRole('radio', { name: 'Difference', exact: true }).check();
	await expect(page.getByRole('combobox', { name: 'Difference baseline' })).toHaveValue('reference');
	await page.locator('.chart-sources summary').click();
	await expect(page.locator('.chart-sources a').first()).toHaveAttribute('href', /^https?:\/\//);
	await first.locator('summary').click();
	await expect(first.getByRole('table')).toBeVisible();
	await expect(first.getByText(/Tilt .* dB\/oct/)).toBeVisible();
	await page.getByRole('switch', { name: 'Regions', exact: true }).check();
	const regions = page.getByRole('group', { name: 'Frequency regions', exact: true }).getByRole('button');
	await expect(regions).toHaveCount(7);
	expect(
		await regions.evaluateAll((buttons) =>
			buttons.every((button) => {
				const range = document.createRange();
				range.selectNodeContents(button);
				const label = range.getBoundingClientRect();
				const target = button.getBoundingClientRect();
				return (
					getComputedStyle(button).writingMode === 'horizontal-tb' &&
					label.left >= target.left &&
					label.right <= target.right
				);
			})
		)
	).toBe(true);
	await accessible(page);
	expect(errors).toEqual([]);
});

test('love and reasoned dislike produce a persistent, explained taste model', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('radio', { name: 'Match my taste profile', exact: true }).check();
	await expect(page.getByText(/Add at least one sound-related Like or Love/)).toBeVisible();
	await pick(page, 'Add an IEM to your profile', 'Truthear Hexa');
	await pick(page, 'Add an IEM to your profile', 'Truthear Nova');
	const nova = page.getByRole('region', { name: 'Truthear Nova', exact: true });
	await nova.getByRole('radio', { name: 'Dislike', exact: true }).check();
	await nova.getByRole('checkbox', { name: 'Too much bass', exact: true }).check();
	await expect(page.getByRole('region', { name: 'Taste model summary' })).toBeVisible();
	await expect(
		page.getByText('Not enough agreement yet to describe this taste against typical IEMs.', { exact: true })
	).toBeVisible();
	await expect(page.getByRole('region', { name: 'Taste model summary' })).not.toContainText(
		/population-relative|conservative default profile|positive examples/
	);
	await expect(page.locator('.result-row').first()).toBeVisible();
	const tasteCurve = page.getByRole('button', { name: '1 Taste 1 centre (derived)', exact: true });
	await expect(tasteCurve).toBeVisible();
	await expect(tasteCurve).toHaveAttribute('aria-pressed', 'true');
	const first = page.locator('.result-row').first();
	await first.locator('summary').click();
	await expect(first.getByText(/Closest liked product: Truthear Hexa/)).toBeVisible();
	await expect(first.getByText(/Too much bass: (satisfied|violated|unknown)/)).toBeVisible();
	await first.getByRole('button', { name: 'Show on chart', exact: true }).click();
	await expect(page.locator('.legend-row')).toHaveCount(2);
	await page.reload();
	await expect(
		page
			.getByRole('region', { name: 'Truthear Hexa', exact: true })
			.getByRole('radio', { name: 'Love', exact: true })
	).toBeChecked();
	await expect(nova.getByRole('radio', { name: 'Dislike', exact: true })).toBeChecked();
	await expect(nova.getByRole('checkbox', { name: 'Too much bass', exact: true })).toBeChecked();
	await expect(page.getByRole('region', { name: 'Taste model summary' })).toBeVisible();
	await expect(
		page.locator('.result-row').getByRole('heading', { name: 'Truthear Hexa', exact: true })
	).toHaveCount(0);
	await expect(
		page.locator('.result-row').getByRole('heading', { name: 'Truthear Nova', exact: true })
	).toHaveCount(0);
	await accessible(page);
	await page.getByRole('button', { name: 'Clear profile', exact: true }).click();
	await expect(page.getByText(/No IEMs in your profile yet/)).toBeVisible();
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(nova.getByRole('radio', { name: 'Dislike', exact: true })).toBeChecked();
});

test('invalid import and unknown references are errors, not empty successful searches', async ({ page }) => {
	await page.goto('/?ref=not-a-real-product');
	await expect(page.getByText('Product is not in the catalog.', { exact: true }).first()).toBeVisible();
	await expect(page.locator('.result-row')).toHaveCount(0);
	await page.getByRole('radio', { name: 'Match my taste profile', exact: true }).check();
	await page
		.getByLabel('Import profile file')
		.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":2}') });
	await expect(page.getByText(/Import failed: Expected a Tonewave version 1 profile/)).toBeVisible();
	await expect(page.getByText(/No IEMs in your profile yet/)).toBeVisible();
	await accessible(page);
});
