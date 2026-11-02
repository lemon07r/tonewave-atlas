import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import type { Catalog, Manifest } from '../../src/core/dataset/types.ts';
import { parseProfile, PROFILE_KEY, type WorkspaceItem } from '../../src/lib/profile/profile.ts';

const manifest = JSON.parse(readFileSync('static/data/manifest.json', 'utf8')) as Manifest;
const catalog = JSON.parse(
	gunzipSync(readFileSync(`static/data/${manifest.version}/catalog-headphone.json.gz`)).toString()
) as Catalog;
const hd600 = catalog.products.find(
	(product) => product.brand === 'Sennheiser' && product.model === 'HD 600'
);
const mv1 = catalog.products.find((product) => product.brand === 'Sony' && product.model === 'MDR-MV1');
if (!hd600 || !mv1) throw new Error('Cross-form fixtures require the published HD 600 and MDR-MV1.');
const hdId = hd600.id,
	mvId = mv1.id;
const measurement = catalog.measurements.find(
	(row) => row.productId === hdId && row.variant.kind === 'default'
);
if (!measurement) throw new Error('Cross-form fixtures require a real default HD 600 measurement.');
const measurementId = measurement.id;
const hexa = 'p-19d1654fcb150bf1aa2f';
const item = (
	productId: string,
	rating: WorkspaceItem['rating'],
	extra: Partial<WorkspaceItem> = {}
): WorkspaceItem => ({
	productId,
	rating,
	strength: rating === 'love' || rating === 'dislike' ? 1 : rating === 'like' ? 0.6 : 0,
	soundRelated: true,
	...extra
});

async function redirectFixture(page: Page) {
	await page.route('**/catalog-headphone.json.gz', async (route) => {
		const response = await route.fetch();
		const bytes = await response.body();
		const data = JSON.parse(
			(bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString()
		) as Catalog;
		data.redirects = {
			products: { ...data.redirects?.products, 'misfiled-hd600': hdId, 'misfiled-mv1': mvId },
			measurements: { ...data.redirects?.measurements, 'misfiled-headphone-measurement': measurementId }
		};
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
	});
}

test.beforeEach(async ({ page }) => {
	await redirectFixture(page);
});
test.afterEach(async ({ page }) => {
	await page.unrouteAll({ behavior: 'wait' });
});

test('Discover follows a misfiled headphone link without adding history or losing its one-time named note', async ({
	page
}) => {
	await page.addInitScript(() => {
		Object.assign(window, { initialHistoryLength: history.length });
	});
	await page.goto(
		'/?ref=misfiled-hd600&m=misfiled-headphone-measurement&rig=iem-711&sources=old-iem-source&sourceMode=only&unknown=keep#main'
	);
	await expect.poll(() => new URL(page.url()).searchParams.get('form')).toBe('headphones');
	await expect.poll(() => new URL(page.url()).searchParams.get('ref')).toBe(hdId);
	expect(new URL(page.url()).searchParams.get('m')).toBe(measurementId);
	expect(new URL(page.url()).searchParams.get('unknown')).toBe('keep');
	expect(new URL(page.url()).hash).toBe('#main');
	for (const key of ['rig', 'sources', 'sourceMode'])
		expect(new URL(page.url()).searchParams.has(key)).toBe(false);
	const row = page.getByRole('region', { name: 'Sennheiser HD 600', exact: true });
	await expect(row.getByRole('radio', { name: 'Like', exact: true })).toBeChecked();
	await expect(row.getByRole('radio', { name: 'Love', exact: true })).not.toBeChecked();
	await expect(page.locator('.result-row').first()).toBeVisible();
	const note = page.getByRole('complementary', { name: 'Catalog update' });
	await expect(note).toContainText('Sennheiser HD 600: opened in Headphones after a catalog update.');
	expect(await page.evaluate(() => history.length)).toBe(
		await page.evaluate(() => (window as unknown as { initialHistoryLength: number }).initialHistoryLength)
	);
	await page.reload();
	await expect(page.locator('.result-row').first()).toBeVisible();
	await expect(note).toHaveCount(0);
});

test('Explore and Compare open the other catalog and retain product, measurement and difference identities', async ({
	page
}) => {
	await page.goto('/explore?product=misfiled-mv1&unknown=keep#main');
	await expect(page.getByRole('heading', { name: 'MDR-MV1', exact: true })).toBeVisible();
	expect(new URL(page.url()).searchParams.get('form')).toBe('headphones');
	expect(new URL(page.url()).searchParams.get('product')).toBe(mvId);
	await expect(page.getByRole('complementary', { name: 'Catalog update' })).toContainText(
		'Sony MDR-MV1: opened in Headphones'
	);
	await page.goto(
		'/compare?p=misfiled-hd600,misfiled-mv1&m=misfiled-headphone-measurement&diff=misfiled-headphone-measurement&unknown=keep#main'
	);
	await expect.poll(() => new URL(page.url()).searchParams.get('form')).toBe('headphones');
	await expect(page.getByTestId('comparison-row')).toHaveCount(3);
	expect(new URL(page.url()).searchParams.get('p')).toBe(`${hdId},${mvId}`);
	expect(new URL(page.url()).searchParams.get('m')).toBe(measurementId);
	expect(new URL(page.url()).searchParams.get('diff')).toBe(measurementId);
	expect(new URL(page.url()).searchParams.get('unknown')).toBe('keep');
	expect(new URL(page.url()).hash).toBe('#main');
	await expect(page.getByRole('complementary', { name: 'Catalog update' })).toContainText(
		'opened in Headphones'
	);
});

for (const version of [1, 2]) {
	test(`v${version} saved cross-form items move with their details and collision Undo stays session-only`, async ({
		page
	}) => {
		const hd = item('misfiled-hd600', 'love', {
			measurementId: 'misfiled-headphone-measurement',
			likedAspects: ['bass']
		});
		const sony = item('misfiled-mv1', 'neutral', { soundRelated: false, dislikeReasons: ['other'] });
		const before = {
			version,
			profiles: { iem: [item(hexa, 'like'), hd, sony], headphone: [item(hdId, 'like')] }
		};
		await page.addInitScript(
			({ key, value }) => {
				if (!localStorage.getItem(key)) localStorage.setItem(key, value);
			},
			{ key: PROFILE_KEY, value: JSON.stringify(before) }
		);
		await page.goto('/');
		const expected = {
			version: 2,
			profiles: { iem: [item(hexa, 'like')], headphone: [item(hdId, 'like'), { ...sony, productId: mvId }] }
		};
		await expect
			.poll(async () =>
				parseProfile(await page.evaluate((key) => localStorage.getItem(key) ?? '', PROFILE_KEY))
			)
			.toEqual(expected);
		const note = page.getByRole('complementary', { name: 'Catalog update' });
		await expect(note).toContainText('Sennheiser HD 600: moved to the Headphones profile');
		await expect(note).toContainText('Sony MDR-MV1: moved to the Headphones profile');
		await expect(note).toContainText('duplicate rating from an older link was dropped (love)');
		await note.getByRole('button', { name: 'Undo', exact: true }).click();
		await expect(page.locator('.profile-row')).toHaveCount(3);
		await page
			.getByRole('region', { name: 'Truthear Hexa', exact: true })
			.getByRole('radio', { name: 'Neutral', exact: true })
			.check();
		expect(parseProfile(await page.evaluate((key) => localStorage.getItem(key) ?? '', PROFILE_KEY))).toEqual(
			expected
		);
		await page.reload();
		await expect(page.locator('.profile-row')).toHaveCount(1);
		await expect(note).toHaveCount(0);
	});
}

test('imported misfiled items move to the other profile without inventing a rating', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('.example')).toHaveCount(3);
	const saved = item('misfiled-mv1', 'unrated', { soundRelated: false, likedAspects: ['mids'] });
	await page.getByLabel('Import profile file', { exact: true }).setInputFiles({
		name: 'misfiled-profile.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify({ version: 2, profiles: { iem: [saved], headphone: [] } }))
	});
	await expect
		.poll(async () => {
			const value = await page.evaluate((key) => localStorage.getItem(key), PROFILE_KEY);
			return value ? parseProfile(value).profiles : undefined;
		})
		.toEqual({ iem: [], headphone: [{ ...saved, productId: mvId }] });
	await expect(page.getByRole('complementary', { name: 'Catalog update' })).toContainText(
		'Sony MDR-MV1: moved to the Headphones profile'
	);
	await expect(page.locator('.profile-row')).toHaveCount(0);
});

test('shared collision Undo survives Discover changing forms without overwriting saved data', async ({
	page
}) => {
	const ratings = [item('misfiled-hd600', 'love'), item(hdId, 'like')];
	await page.goto(`/?${new URLSearchParams({ ratings: JSON.stringify(ratings) })}`);
	await expect.poll(() => new URL(page.url()).searchParams.get('form')).toBe('headphones');
	await expect(page.locator('.profile-row')).toHaveCount(1);
	const note = page.getByRole('complementary', { name: 'Catalog update' });
	await expect(note).toContainText('duplicate rating from an older link was dropped (love)');
	const saved = await page.evaluate((key) => localStorage.getItem(key), PROFILE_KEY);
	await note.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect.poll(() => new URL(page.url()).searchParams.has('form')).toBe(false);
	await expect
		.poll(() => JSON.parse(new URL(page.url()).searchParams.get('ratings') ?? '[]') as unknown)
		.toEqual(ratings);
	await expect(page.locator('.profile-row')).toHaveCount(2);
	expect(await page.evaluate((key) => localStorage.getItem(key), PROFILE_KEY)).toBe(saved);
});

test('failed optional other-catalog metadata keeps an unresolved link intact and the active catalog usable', async ({
	page
}) => {
	let requests = 0;
	await page.route('**/catalog-headphone.json.gz', async (route) => {
		if (++requests > 1) await route.abort('failed');
		else await route.fallback();
	});
	await page.goto('/?ref=misfiled-hd600');
	await expect(page.getByRole('complementary', { name: 'Catalog update' })).toContainText(
		'could not be resolved'
	);
	expect(new URL(page.url()).searchParams.get('ref')).toBe('misfiled-hd600');
	expect(new URL(page.url()).searchParams.has('form')).toBe(false);
	const search = page.getByRole('combobox', { name: 'Add an IEM', exact: true });
	await search.fill('Truthear Hexa');
	await expect(page.getByRole('option').first()).toContainText('Truthear Hexa');
	await expect(page.getByText(/Catalog unavailable:/)).toHaveCount(0);
});
