import { expect, test } from 'vitest';
import { CatalogIdentity, type IdentityCatalog } from './identity.ts';
import { canonicalItem, migrateItems, migrateProfile, migrateUrl } from './migrate.ts';
import { emptyProfile, parseProfile, strength, type WorkspaceItem } from '#lib/profile/profile.ts';
import { profileStore } from '#lib/profile/store.ts';

const fixture: IdentityCatalog = {
	products: [
		{ id: 'current', brand: 'Fixture', model: 'One' },
		{ id: 'split-current', brand: 'Fixture', model: 'Split' }
	],
	measurements: [
		{ id: 'variant', productId: 'current' },
		{ id: 'split-variant', productId: 'split-current' }
	],
	redirects: {
		products: { old: 'current', older: 'current' },
		measurements: { 'old-variant': 'variant', 'old-split-variant': 'split-variant' }
	}
};
const catalog = new CatalogIdentity(fixture);
const item = (
	productId: string,
	rating: WorkspaceItem['rating'],
	extra: Partial<WorkspaceItem> = {}
): WorkspaceItem => ({ productId, rating, strength: strength(rating), soundRelated: true, ...extra });

test('same-rating collisions union evidence, preserve either fit flag and explicit variant', () => {
	const result = migrateItems(
		[
			item('old', 'like', {
				likedAspects: ['bass'],
				dislikeReasons: ['other'],
				soundRelated: false,
				measurementId: 'old-variant'
			}),
			item('current', 'like', { likedAspects: ['bass', 'mids'], dislikeReasons: ['bass-lacks-punch'] })
		],
		catalog
	);
	expect(result.items).toEqual([
		item('current', 'like', {
			likedAspects: ['bass', 'mids'],
			dislikeReasons: ['other', 'bass-lacks-punch'],
			soundRelated: false,
			measurementId: 'variant'
		})
	]);
	expect(result.messages).toEqual([]);
	expect(result.droppedRating).toBe(false);
});

for (const inactive of ['unrated', 'neutral'] as const) {
	for (const rating of ['love', 'like', 'dislike'] as const) {
		test(`${rating} wins over ${inactive}, even when the inactive entry was canonical`, () => {
			for (const rows of [
				[item('current', inactive), item('old', rating)],
				[item('old', rating), item('current', inactive)],
				[item('current', rating), item('old', inactive)]
			]) {
				const result = migrateItems(rows, catalog);
				expect(result.items).toEqual([item('current', rating)]);
				expect(result.messages).toEqual([]);
			}
		});
	}
}

test('conflicting active ratings preserve the canonical entry regardless of original order', () => {
	for (const rows of [
		[item('old', 'like'), item('current', 'dislike')],
		[item('current', 'dislike'), item('old', 'like')]
	]) {
		const result = migrateItems(rows, catalog);
		expect(result.items).toEqual([item('current', 'dislike')]);
		expect(result.droppedRating).toBe(true);
		expect(result.messages).toEqual([
			'Fixture One: a duplicate rating from an older link was dropped (like).'
		]);
	}
});

test('two aliases use stable profile order if neither entry already has the canonical id', () => {
	expect(migrateItems([item('old', 'love'), item('older', 'dislike')], catalog).items).toEqual([
		item('current', 'love')
	]);
});

test('three-way collisions retain all evidence matching the canonical winner, independent of reduction order', () => {
	const a = item('old', 'like');
	const b = item('older', 'dislike', {
		likedAspects: ['bass'],
		dislikeReasons: ['other'],
		soundRelated: false,
		measurementId: 'old-variant'
	});
	const c = item('current', 'dislike', { likedAspects: ['mids'], dislikeReasons: ['bass-lacks-punch'] });
	for (const rows of [
		[a, b, c],
		[a, c, b],
		[b, a, c],
		[b, c, a],
		[c, a, b],
		[c, b, a]
	]) {
		const result = migrateItems(rows, catalog);
		expect(result.items).toHaveLength(1);
		expect(result.items[0]).toMatchObject({
			productId: 'current',
			rating: 'dislike',
			soundRelated: false,
			measurementId: 'variant'
		});
		expect(result.items[0]?.likedAspects?.toSorted()).toEqual(['bass', 'mids']);
		expect(result.items[0]?.dislikeReasons?.toSorted()).toEqual(['bass-lacks-punch', 'other']);
		expect(result.messages).toEqual([
			'Fixture One: a duplicate rating from an older link was dropped (like).'
		]);
	}
});

test('a split with no product redirect resolves only through its explicit measurement', () => {
	expect(canonicalItem(item('split-old', 'like', { measurementId: 'old-split-variant' }), catalog)).toEqual(
		item('split-current', 'like', { measurementId: 'split-variant' })
	);
	const unresolved = migrateItems([item('split-old', 'like')], catalog);
	expect(unresolved.items).toEqual([item('split-old', 'like')]);
	expect(unresolved.messages).toHaveLength(1);
	expect(unresolved.messages[0]).toContain('could not be resolved');
});

test('migrates v1 and v2 payloads, keeps both forms separate, and Undo restores only the session', () => {
	for (const version of [1, 2]) {
		let saved = JSON.stringify({
			version,
			profiles: { iem: [item('old', 'like'), item('current', 'dislike')], headphone: [item('old', 'love')] }
		});
		const store = profileStore({
			getItem: () => saved,
			setItem: (_, text) => {
				saved = text;
			}
		});
		const before = store.value;
		const result = migrateProfile(before, { iem: catalog, headphone: catalog });
		store.change(result.profile);
		expect(parseProfile(saved).profiles.iem).toEqual([item('current', 'dislike')]);
		expect(parseProfile(saved).profiles.headphone).toEqual([item('current', 'love')]);
		store.restoreSession(before);
		expect(store.value).toEqual(before);
		expect(store.value.profiles.iem).toHaveLength(2);
		expect(parseProfile(saved)).toEqual(result.profile);
	}
});

test('rewrites every shared identity parameter without dropping other controls or adding a history entry', () => {
	const url = new URL(
		'https://example.org/compare?ref=old&refs=old,current&product=old&measurement=old-variant&p=old,current&m=old-variant&chart=old,old-variant&diff=old-variant&rig=iem-711&focus=bass&unknown=keep#evidence'
	);
	const result = migrateUrl(url, catalog);
	expect(Object.fromEntries(result.url.searchParams)).toEqual({
		ref: 'current',
		refs: 'current',
		product: 'current',
		measurement: 'variant',
		p: 'current',
		m: 'variant',
		chart: 'current,variant',
		diff: 'variant',
		rig: 'iem-711',
		focus: 'bass',
		unknown: 'keep'
	});
	expect(result.url.hash).toBe('#evidence');
	expect(result.messages).toEqual([]);
	expect(result.changed).toBe(true);
	expect(migrateUrl(result.url, catalog).changed).toBe(false);
});

test('explicit measurement URLs recover split ownership, while ambiguous product links stay intact', () => {
	for (const query of [
		'ref=split-old&m=old-split-variant',
		'product=split-old&measurement=old-split-variant'
	]) {
		const result = migrateUrl(new URL(`https://example.org/?${query}`), catalog);
		expect(result.url.search).toContain('split-current');
		expect(result.url.search).toContain('split-variant');
		expect(result.messages).toEqual([]);
	}
	const result = migrateUrl(new URL('https://example.org/?ref=split-old'), catalog);
	expect(result.url.searchParams.get('ref')).toBe('split-old');
	expect(result.messages).toHaveLength(1);
});

test('ratings URLs use the same strict collision policy and invalid evidence remains untouched', () => {
	const url = new URL('https://example.org/');
	url.searchParams.set('ratings', JSON.stringify([item('old', 'like'), item('current', 'dislike')]));
	const result = migrateUrl(url, catalog);
	expect(JSON.parse(result.url.searchParams.get('ratings') ?? '')).toEqual([item('current', 'dislike')]);
	expect(result.droppedRating).toBe(true);
	url.searchParams.set('ratings', '[invalid');
	expect(migrateUrl(url, catalog).url.searchParams.get('ratings')).toBe('[invalid');
});

test('unchanged identities do not re-encode a query or navigate over a concurrent workspace edit', () => {
	for (const query of [
		'ratings=[]',
		'ref=current&chart=current,variant&unknown=keep%20space',
		'ratings=[]&p=current,split-current'
	]) {
		const url = new URL(`https://example.org/?${query}#workspace`);
		const result = migrateUrl(url, catalog);
		expect(result.changed).toBe(false);
		expect(result.url.href).toBe(url.href);
	}
});

test('legacy catalogs without redirects still resolve current ids, never inherited object keys', () => {
	const legacy = new CatalogIdentity({ products: fixture.products, measurements: fixture.measurements });
	expect(legacy.productId('current')).toBe('current');
	expect(legacy.productId('old')).toBeUndefined();
	expect(catalog.productId('toString')).toBeUndefined();
	expect(catalog.measurementId('__proto__')).toBeUndefined();
	expect(migrateProfile(emptyProfile(), { iem: legacy }).changed).toBe(false);
});
