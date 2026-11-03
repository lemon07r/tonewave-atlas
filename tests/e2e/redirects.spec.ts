import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import type { Catalog, Manifest } from '../../src/core/dataset/types.ts';
import { parseProfile, PROFILE_KEY } from '../../src/lib/profile/profile.ts';

const reference = 'p-437de4e3e3402077cdc3';
const hexa = 'p-19d1654fcb150bf1aa2f';
const manifest = JSON.parse(readFileSync('static/data/manifest.json', 'utf8')) as Manifest;
const catalog = JSON.parse(
	gunzipSync(readFileSync(`static/data/${manifest.version}/catalog-iem.json.gz`)).toString()
) as Catalog;
const measurement = catalog.measurements.find(
	(m) => m.productId === reference && m.partition === 'iem-711' && m.variant.kind === 'default'
);
if (!measurement) throw new Error('Redirect fixture requires a real default reference measurement.');
const variant = measurement.id;
const aliases = {
	products: { 'legacy-product': reference, 'legacy-hexa': hexa },
	measurements: { 'legacy-measurement': variant }
};
// Keep the real catalog compressed, as served in production. Expanding it in every route
// sends ~59 MB through Playwright per request and makes runner load look like a migration failure.
const redirectedCatalog = gzipSync(JSON.stringify({ ...catalog, redirects: aliases }));
const like = (productId: string) => ({ productId, rating: 'like', strength: 0.6, soundRelated: true });
const dislike = (productId: string) => ({ productId, rating: 'dislike', strength: 1, soundRelated: true });

async function redirects(page: Page) {
	await page.route('**/catalog-iem.json.gz', async (route) => {
		await route.fulfill({ status: 200, contentType: 'application/gzip', body: redirectedCatalog });
	});
}

test.beforeEach(async ({ page }) => {
	await redirects(page);
});

test.afterEach(async ({ page }) => {
	// Drain real fixture requests before Playwright closes a page or its worker.
	await page.unrouteAll({ behavior: 'wait' });
});

test('Discover canonicalizes old reference and measurement links with history replacement, not a new entry', async ({
	page
}) => {
	await page.addInitScript(() => {
		Object.assign(window, { initialHistoryLength: history.length });
	});
	await page.goto(
		'/?ref=legacy-product&m=legacy-measurement&refs=legacy-product&rig=iem-711&unknown=keep#main'
	);
	await expect.poll(() => new URL(page.url()).searchParams.get('ref')).toBe(reference);
	await expect.poll(() => new URL(page.url()).searchParams.get('m')).toBe(variant);
	expect(new URL(page.url()).searchParams.get('refs')).toBe(reference);
	expect(new URL(page.url()).searchParams.get('unknown')).toBe('keep');
	expect(new URL(page.url()).hash).toBe('#main');
	await expect(page.locator('.result-row')).toHaveCount(20);
	expect(await page.evaluate(() => history.length)).toBe(
		await page.evaluate(() => (window as unknown as { initialHistoryLength: number }).initialHistoryLength)
	);
	await expect(page.getByRole('complementary', { name: 'Catalog update' })).toHaveCount(0);
	await page.locator('.profile-row details > summary').click();
	await expect(
		page.getByRole('combobox', { name: 'Measurement for CrinEar Reference', exact: true })
	).toHaveValue(variant);
});

test('Explore and Compare resolve aliases before catalog lookups and retain all comparison identities', async ({
	page
}) => {
	await page.goto('/explore?product=legacy-product&measurement=legacy-measurement&unknown=keep#main');
	await expect(page.getByRole('heading', { name: 'Reference', exact: true })).toBeVisible();
	expect(new URL(page.url()).searchParams.get('product')).toBe(reference);
	expect(new URL(page.url()).searchParams.get('measurement')).toBe(variant);
	await page.goto(
		'/compare?p=legacy-product,legacy-hexa&m=legacy-measurement&diff=legacy-measurement&unknown=keep#main'
	);
	await expect(page.getByTestId('comparison-row')).toHaveCount(3);
	await expect.poll(() => new URL(page.url()).searchParams.get('p')).toBe(`${reference},${hexa}`);
	expect(new URL(page.url()).searchParams.get('m')).toBe(variant);
	expect(new URL(page.url()).searchParams.get('diff')).toBe(variant);
	expect(new URL(page.url()).searchParams.get('unknown')).toBe('keep');
	expect(new URL(page.url()).hash).toBe('#main');
	await expect(page.getByRole('complementary', { name: 'Catalog update' })).toHaveCount(0);
});

for (const version of [1, 2]) {
	test(`v${version} saved collisions keep the canonical rating and Undo restores the original profile only for this session`, async ({
		page
	}) => {
		const before = {
			version,
			profiles: { iem: [like('legacy-product'), dislike(reference)], headphone: [] }
		};
		await page.addInitScript(
			({ key, text }) => {
				if (!localStorage.getItem(key)) localStorage.setItem(key, text);
			},
			{ key: PROFILE_KEY, text: JSON.stringify(before) }
		);
		await page.goto('/');
		const note = page.getByRole('complementary', { name: 'Catalog update' });
		await expect(note).toContainText(
			'CrinEar Reference: a duplicate rating from an older link was dropped (like).'
		);
		await expect(page.locator('.profile-row')).toHaveCount(1);
		const saved = await page.evaluate((key) => localStorage.getItem(key), PROFILE_KEY);
		expect(parseProfile(saved ?? '').profiles.iem).toEqual([dislike(reference)]);
		await note.getByRole('button', { name: 'Undo', exact: true }).click();
		await expect(page.locator('.profile-row')).toHaveCount(2);
		await expect(page.locator('.profile-row h3')).toHaveText(['CrinEar Reference', 'CrinEar Reference']);
		expect(await page.evaluate((key) => localStorage.getItem(key), PROFILE_KEY)).toBe(saved);
		await page.reload();
		await expect(page.locator('[role="listbox"][aria-label="Add an IEM"]')).toHaveAttribute(
			'aria-busy',
			'false'
		);
		await expect(page.locator('.profile-row')).toHaveCount(2);
		await expect(note).toHaveCount(0);
		const fresh = await page.context().newPage();
		try {
			await fresh.goto('/');
			await expect(fresh.locator('.profile-row')).toHaveCount(1);
		} finally {
			await fresh.close();
		}
	});
}

test('migration Undo and later session edits survive form switches and route remounts', async ({ page }) => {
	const before = {
		version: 2,
		profiles: { iem: [like('legacy-product'), dislike(reference)], headphone: [] }
	};
	await page.addInitScript(
		({ key, text }) => {
			if (!localStorage.getItem(key)) localStorage.setItem(key, text);
		},
		{ key: PROFILE_KEY, text: JSON.stringify(before) }
	);
	await page.goto('/');
	const note = page.getByRole('complementary', { name: 'Catalog update' });
	await note.getByRole('button', { name: 'Undo', exact: true }).click();
	const saved = await page.evaluate((key) => localStorage.getItem(key), PROFILE_KEY);
	for (const form of ['Headphones', 'IEMs']) {
		const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
		if (await menu.isVisible()) await menu.click();
		await page.getByRole('radio', { name: form, exact: true }).check();
	}
	await expect(page.locator('.profile-row')).toHaveCount(2);
	await page.locator('.profile-row').first().getByRole('radio', { name: 'Neutral', exact: true }).check();
	await expect.poll(() => new URL(page.url()).searchParams.get('ratings')).toContain('neutral');
	await page.goto('/compare');
	await page.goto('/');
	await expect(page.locator('.profile-row')).toHaveCount(2);
	await expect(
		page.locator('.profile-row').first().getByRole('radio', { name: 'Neutral', exact: true })
	).toBeChecked();
	expect(await page.evaluate((key) => localStorage.getItem(key), PROFILE_KEY)).toBe(saved);
});

test('Explore retains its product detail when only auxiliary identities migrate', async ({ page }) => {
	for (const [key, value, canonical] of [
		['chart', 'legacy-hexa', hexa],
		['diff', 'legacy-measurement', variant],
		['refs', 'legacy-hexa', hexa],
		['ratings', JSON.stringify([like('legacy-hexa')]), JSON.stringify([like(hexa)])]
	] as const) {
		await page.goto(`/explore?${new URLSearchParams({ product: reference, [key]: value })}`);
		await expect.poll(() => new URL(page.url()).searchParams.get(key)).toBe(canonical);
		await expect(page.getByRole('heading', { name: 'Reference', exact: true })).toBeVisible();
		await expect(page.locator('.catalog-row')).toHaveCount(0);
	}
});

test('split aliases require an explicit measurement, and unresolved links are retained with a one-time quiet note', async ({
	page
}) => {
	await page.goto('/?ref=split-product&m=legacy-measurement&rig=iem-711');
	await expect(page.locator('.result-row')).toHaveCount(20);
	expect(new URL(page.url()).searchParams.get('ref')).toBe(reference);
	expect(new URL(page.url()).searchParams.get('m')).toBe(variant);
	await page.goto('/?ref=split-product&rig=iem-711');
	const note = page.getByRole('complementary', { name: 'Catalog update' });
	await expect(note).toContainText(
		'split-product: this item could not be resolved in the current catalog. It has been kept.'
	);
	expect(new URL(page.url()).searchParams.get('ref')).toBe('split-product');
	await note.getByRole('button', { name: 'Dismiss catalog update' }).click();
	await page.reload();
	await expect(
		page.getByText('A rated reference is not in this form-factor catalog. Remove it or switch form factor.', {
			exact: true
		})
	).toBeVisible();
	await expect(note).toHaveCount(0);
	expect(new URL(page.url()).searchParams.get('ref')).toBe('split-product');
});

test('shared ratings use the same merge policy and can be restored for the session', async ({ page }) => {
	const ratings = [like('legacy-product'), dislike(reference)];
	await page.goto(`/?${new URLSearchParams({ ratings: JSON.stringify(ratings), rig: 'iem-711' })}`);
	const note = page.getByRole('complementary', { name: 'Catalog update' });
	await expect(note).toContainText('a duplicate rating from an older link was dropped');
	await expect
		.poll(() => JSON.parse(new URL(page.url()).searchParams.get('ratings') ?? '[]') as unknown)
		.toEqual([dislike(reference)]);
	await note.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect
		.poll(() => JSON.parse(new URL(page.url()).searchParams.get('ratings') ?? '[]') as unknown)
		.toEqual(ratings);
	await expect(page.locator('.profile-row')).toHaveCount(2);
});

test('migration Undo retains the earliest snapshot while import has its own ordinary Undo', async ({
	page
}) => {
	const startup = {
		version: 2,
		profiles: { iem: [like('legacy-product'), dislike(reference)], headphone: [] }
	};
	await page.addInitScript(
		({ key, value }) => {
			localStorage.setItem(key, value);
		},
		{ key: PROFILE_KEY, value: JSON.stringify(startup) }
	);
	await page.goto('/');
	const note = page.getByRole('complementary', { name: 'Catalog update' });
	await expect(note).toContainText('a duplicate rating from an older link was dropped');
	const imported = {
		version: 2,
		profiles: { iem: [dislike('legacy-product'), like(reference)], headphone: [] }
	};
	const file = {
		name: 'import.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(imported))
	};
	await page.getByLabel('Import profile file', { exact: true }).setInputFiles(file);
	await expect(page.locator('.profile-row').getByRole('radio', { name: 'Like', exact: true })).toBeChecked();
	await page.locator('.toast').getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(
		page.locator('.profile-row').getByRole('radio', { name: 'Dislike', exact: true })
	).toBeChecked();
	await page.getByLabel('Import profile file', { exact: true }).setInputFiles(file);
	await expect(page.locator('.profile-row').getByRole('radio', { name: 'Like', exact: true })).toBeChecked();
	const saved = await page.evaluate((key) => localStorage.getItem(key), PROFILE_KEY);
	expect(parseProfile(saved ?? '').profiles.iem).toEqual([like(reference)]);
	await note.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.locator('.profile-row')).toHaveCount(2);
	await expect(
		page.locator('.profile-row').getByRole('radio', { name: 'Like', exact: true }).first()
	).toBeChecked();
	await expect(
		page.locator('.profile-row').getByRole('radio', { name: 'Dislike', exact: true }).last()
	).toBeChecked();
	expect(await page.evaluate((key) => localStorage.getItem(key), PROFILE_KEY)).toBe(saved);
});
