import { expect, test } from '@playwright/test';

test('stacked catalog filters keep visual and keyboard order aligned', async ({ page }) => {
	await page.setViewportSize({ width: 640, height: 900 });
	await page.goto('/explore');
	const brand = page.getByRole('combobox', { name: 'Brand', exact: true });
	const sort = page.getByRole('combobox', { name: 'Sort by', exact: true });
	const search = page.getByRole('searchbox', { name: 'Filter IEMs', exact: true });
	await expect(brand).toBeVisible();
	const brandBox = await brand.boundingBox();
	const searchBox = await search.boundingBox();
	expect(brandBox).not.toBeNull();
	expect(searchBox).not.toBeNull();
	if (!brandBox || !searchBox) throw new Error('Catalog controls missing');
	expect(brandBox.y).toBeLessThan(searchBox.y);
	await brand.focus();
	await page.keyboard.press('Tab');
	await expect(sort).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(search).toBeFocused();
});

test('browser chrome follows saved themes and subsequent system changes', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await page.addInitScript(() => {
		localStorage.setItem('tonewave-theme', 'dark');
	});
	await page.goto('/compare');
	const meta = page.locator('meta[name="theme-color"]');
	await expect(meta).toHaveAttribute('content', '#1c211f');
	await page.getByRole('button', { name: 'Theme: dark. Switch to system theme', exact: true }).click();
	await expect(meta).toHaveAttribute('content', '#f6f4ee');
	await page.emulateMedia({ colorScheme: 'dark' });
	await expect(meta).toHaveAttribute('content', '#1c211f');
	await page.getByRole('button', { name: 'Theme: system. Switch to light theme', exact: true }).click();
	await expect(meta).toHaveAttribute('content', '#f6f4ee');
	await page.emulateMedia({ colorScheme: 'light' });
	await page.emulateMedia({ colorScheme: 'dark' });
	await expect(meta).toHaveAttribute('content', '#f6f4ee');
});
