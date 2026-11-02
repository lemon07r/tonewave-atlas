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

test.afterEach(async ({ page }) => {
	await page.unrouteAll({ behavior: 'wait' });
});
