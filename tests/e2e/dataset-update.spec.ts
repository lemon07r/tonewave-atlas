import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const manifest = JSON.parse(readFileSync('static/data/manifest.json', 'utf8')) as { version: string };
const reference = 'p-437de4e3e3402077cdc3';

for (const scenario of [
	{ name: 'catalog', url: '/explore', file: 'catalog-iem.json.gz' },
	{ name: 'search', url: '/', file: 'catalog-iem.json.gz' },
	{ name: 'rank', url: `/?ref=${reference}&rig=iem-711`, file: 'rank-iem-711.bin.gz' },
	{ name: 'detail', url: `/explore?product=${reference}`, file: 'detail-*.bin.gz' }
]) {
	test(`dataset update during ${scenario.name} offers persistent Reload without a generic error`, async ({
		page
	}) => {
		let manifests = 0;
		await page.route('**/data/manifest.json', async (route) => {
			manifests++;
			await route.fulfill({ json: manifests === 1 ? manifest : { ...manifest, version: 'updated-fixture' } });
		});
		await page.route(`**/data/${manifest.version}/${scenario.file}`, (route) =>
			route.fulfill({ status: 404, body: 'Dataset replaced' })
		);
		await page.goto(scenario.url);
		const notice = page
			.getByRole('status')
			.filter({ hasText: 'The dataset was updated. Reload to continue.' });
		await expect(notice).toBeVisible();
		await expect(notice.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
		await expect(
			page.getByText(
				/Catalog unavailable:|Dataset request failed|Analysis unavailable|Could not load measurement sources/
			)
		).toHaveCount(0);
		await page.getByRole('link', { name: 'Method', exact: true }).first().click();
		await expect(notice).toBeVisible();
		expect(manifests).toBeGreaterThanOrEqual(2);
	});
}
