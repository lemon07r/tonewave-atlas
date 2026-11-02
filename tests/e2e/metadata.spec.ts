import { expect, test } from '@playwright/test';

test('Explore browsing does not need a separate UI identity catalog fetch', async ({ page }) => {
	let requests = 0;
	await page.route('**/catalog-iem.json.gz', async (route) => {
		requests++;
		if (requests > 1) await route.abort('failed');
		else await route.continue();
	});
	await page.goto('/explore');
	await expect(page.locator('.catalog-row')).toHaveCount(40);
	await page.getByRole('searchbox', { name: 'Filter IEMs' }).fill('hexa');
	await expect(page.locator('.catalog-row').first().getByRole('heading')).toHaveText('Hexa');
	expect(requests).toBe(1);
});

test('Compare search remains available when optional UI identity metadata fails', async ({ page }) => {
	let requests = 0;
	await page.route('**/catalog-iem.json.gz', async (route) => {
		requests++;
		if (requests > 1) await route.abort('failed');
		else await route.continue();
	});
	await page.goto('/compare');
	const search = page.getByRole('combobox', { name: 'Add to comparison', exact: true });
	await search.fill('Truthear Hexa');
	await expect(page.getByRole('option').first()).toContainText('Truthear Hexa');
	await expect.poll(() => requests).toBe(2);
	await expect(page.getByText(/Catalog metadata request failed/)).toHaveCount(0);
});

test('inactive identity metadata failure cannot disable the active Discover catalog', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem(
			'tonewave.profile.v1',
			JSON.stringify({
				version: 2,
				profiles: {
					iem: [],
					headphone: [{ productId: 'saved-headphone', rating: 'neutral', strength: 0, soundRelated: true }]
				}
			})
		);
	});
	let requests = 0;
	await page.route('**/catalog-headphone.json.gz', async (route) => {
		requests++;
		if (requests > 1) await route.abort('failed');
		else await route.continue();
	});
	await page.goto('/?ref=p-437de4e3e3402077cdc3&rig=iem-711');
	await expect(page.locator('.result-row')).toHaveCount(20);
	await expect.poll(() => requests).toBe(2);
	await expect(page.getByText(/Catalog unavailable:/)).toHaveCount(0);
});

test('Compare form and history navigation never migrate with the previous form identity', async ({
	page
}) => {
	await page.goto('/compare?p=p-19d1654fcb150bf1aa2f');
	await expect(page.getByTestId('comparison-row')).toHaveCount(1);
	await page.evaluate(() => {
		const link = document.createElement('a');
		link.href = '/compare?form=headphones&p=p-d579af27c01cc5f9baa0';
		link.textContent = 'Open headphone comparison fixture';
		document.querySelector('main')?.append(link);
	});
	await page.getByRole('link', { name: 'Open headphone comparison fixture' }).click();
	await expect(page.getByTestId('comparison-row').getByRole('heading')).toHaveText('Sennheiser HD600');
	await expect(page.getByRole('complementary', { name: 'Catalog update' })).toHaveCount(0);
	await page.goBack();
	await expect(page.getByTestId('comparison-row').getByRole('heading')).toHaveText('Truthear Hexa');
	await page.goForward();
	await expect(page.getByTestId('comparison-row').getByRole('heading')).toHaveText('Sennheiser HD600');
	await expect(page.getByRole('complementary', { name: 'Catalog update' })).toHaveCount(0);
});

test('an unrelated Explore URL change preserves the active brand filter', async ({ page }) => {
	await page.goto('/explore');
	await expect(page.locator('.catalog-row')).toHaveCount(40);
	await page.getByRole('combobox', { name: 'Brand', exact: true }).selectOption('Truthear');
	await page.evaluate(() => {
		const link = document.createElement('a');
		link.href = '/explore?unknown=retained#main';
		link.textContent = 'Change unrelated catalog URL';
		document.querySelector('main')?.append(link);
	});
	await page.getByRole('link', { name: 'Change unrelated catalog URL' }).click();
	await expect(page).toHaveURL(/unknown=retained/);
	await expect(page.getByRole('combobox', { name: 'Brand', exact: true })).toHaveValue('Truthear');
	for (const row of await page.locator('.catalog-row').all()) await expect(row).toContainText('Truthear');
});

test.afterEach(async ({ page }) => {
	await page.unrouteAll({ behavior: 'wait' });
});
