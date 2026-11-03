import { expect, test } from 'vitest';
import { CatalogIdentity, type IdentityCatalog } from './identity.ts';
import { canonicalItem, migrateItems, migrateProfile, migrateUrl, needsOtherCatalog } from './migrate.ts';
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

test('a redirected measurement owner wins over a surviving or redirected former product', () => {
	const split = new CatalogIdentity({
		...fixture,
		redirects: { products: { old: 'current' }, measurements: { moved: 'split-variant' } }
	});
	for (const productId of ['current', 'old']) {
		const original = item(productId, 'like', { measurementId: 'moved' });
		const expected = item('split-current', 'like', { measurementId: 'split-variant' });
		expect(canonicalItem(original, split)).toEqual(expected);
		expect(
			migrateProfile({ version: 2, profiles: { iem: [original], headphone: [] } }, { iem: split }).profile
				.profiles.iem
		).toEqual([expected]);
		for (const [key, measurementKey] of [
			['ref', 'm'],
			['product', 'measurement']
		] as const) {
			const url = new URL(`https://example.org/?${key}=${productId}&${measurementKey}=moved`);
			const migrated = migrateUrl(url, split);
			expect(migrated.url.searchParams.get(key)).toBe('split-current');
			expect(migrated.url.searchParams.get(measurementKey)).toBe('split-variant');
			expect(migrateUrl(migrated.url, split).changed).toBe(false);
		}
	}
	// A current mismatched pair is still invalid, not a license to repair arbitrary evidence.
	const mismatched = item('current', 'like', { measurementId: 'split-variant' });
	expect(canonicalItem(mismatched, split)).toEqual(mismatched);
	const invalidUrl = new URL('https://example.org/?ref=current&m=split-variant');
	expect(migrateUrl(invalidUrl, split).url.href).toBe(invalidUrl.href);
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

test('canonical first values still collapse duplicate identity parameters without touching unknown keys', () => {
	const url = new URL(
		'https://example.org/?ref=current&ref=old&p=current&p=old&m=variant&m=old-variant&chart=variant&chart=old-variant&diff=current&diff=old&unknown=one&unknown=two'
	);
	url.searchParams.append('ratings', '[]');
	url.searchParams.append('ratings', JSON.stringify([item('old', 'like')]));
	const migrated = migrateUrl(url, catalog);
	expect(migrated.changed).toBe(true);
	for (const key of ['ref', 'p', 'm', 'chart', 'diff', 'ratings'])
		expect(migrated.url.searchParams.getAll(key)).toHaveLength(1);
	expect(migrated.url.searchParams.getAll('unknown')).toEqual(['one', 'two']);
	expect(migrateUrl(migrated.url, catalog).changed).toBe(false);
});

test('legacy catalogs without redirects still resolve current ids, never inherited object keys', () => {
	const legacy = new CatalogIdentity({ products: fixture.products, measurements: fixture.measurements });
	expect(legacy.productId('current')).toBe('current');
	expect(legacy.productId('old')).toBeUndefined();
	expect(catalog.productId('toString')).toBeUndefined();
	expect(catalog.measurementId('__proto__')).toBeUndefined();
	expect(migrateProfile(emptyProfile(), { iem: legacy }).changed).toBe(false);
});

const headphones = new CatalogIdentity({
	products: [{ id: 'headphone', brand: 'Fixture', model: 'Headphone' }],
	measurements: [{ id: 'headphone-measurement', productId: 'headphone' }],
	redirects: {
		products: { 'misfiled-headphone': 'headphone' },
		measurements: { 'misfiled-measurement': 'headphone-measurement' }
	}
});

test('cross-form saved items move in both directions and merge with the destination canonical rating', () => {
	const profile = emptyProfile();
	profile.profiles.iem = [
		item('current', 'like'),
		item('misfiled-headphone', 'love', { measurementId: 'misfiled-measurement', likedAspects: ['bass'] }),
		item('unresolved', 'neutral')
	];
	profile.profiles.headphone = [item('headphone', 'dislike'), item('old', 'love')];
	const migrated = migrateProfile(profile, { iem: catalog, headphone: headphones });
	expect(migrated.profile.profiles.iem).toEqual([item('current', 'like'), item('unresolved', 'neutral')]);
	expect(migrated.profile.profiles.headphone).toEqual([item('headphone', 'dislike')]);
	expect(migrated.droppedRating).toBe(true);
	expect(migrated.messages).toContain(
		'Fixture Headphone: moved to the Headphones profile after a catalog update.'
	);
	expect(migrated.messages).toContain('Fixture One: moved to the IEMs profile after a catalog update.');
	expect(migrateProfile(migrated.profile, { iem: catalog, headphone: headphones }).changed).toBe(false);
	expect(profile.profiles.iem).toHaveLength(3);
});

test('moving an explicit split preserves rating and preference details without inferring a product name', () => {
	const saved = item('split-misfiled', 'love', {
		measurementId: 'misfiled-measurement',
		soundRelated: false,
		likedAspects: ['mids']
	});
	const migrated = migrateProfile(
		{ version: 2, profiles: { iem: [saved], headphone: [] } },
		{ iem: catalog, headphone: headphones }
	);
	expect(migrated.profile.profiles.iem).toEqual([]);
	expect(migrated.profile.profiles.headphone).toEqual([
		{ ...saved, productId: 'headphone', measurementId: 'headphone-measurement' }
	]);
	expect(
		migrateProfile({ version: 2, profiles: { iem: [saved], headphone: [] } }, { iem: catalog }).profile
			.profiles.iem
	).toEqual([saved]);
});

test('a full destination profile retains the misfiled item instead of exceeding the import limit', () => {
	const products = Array.from({ length: 201 }, (_, i) => ({
		id: `h-${i}`,
		brand: 'Fixture',
		model: `Headphone ${i}`
	}));
	const destination = new CatalogIdentity({ products, measurements: [] });
	const profile = {
		version: 2 as const,
		profiles: {
			iem: [item('h-200', 'like')],
			headphone: products.slice(0, 200).map(({ id }) => item(id, 'neutral'))
		}
	};
	const migrated = migrateProfile(profile, { iem: catalog, headphone: destination });
	expect(migrated.profile.profiles.iem).toEqual(profile.profiles.iem);
	expect(migrated.profile.profiles.headphone).toHaveLength(200);
	expect(migrated.messages.some((message) => message.includes('profile is full'))).toBe(true);
	expect(parseProfile(JSON.stringify(migrated.profile))).toEqual(migrated.profile);
});

test('two full profiles swap all outgoing rows before evaluating destination capacity', () => {
	const iems = Array.from({ length: 200 }, (_, i) => ({ id: `i-${i}`, brand: 'Fixture', model: `IEM ${i}` }));
	const heads = Array.from({ length: 200 }, (_, i) => ({
		id: `h-${i}`,
		brand: 'Fixture',
		model: `Headphone ${i}`
	}));
	const profile = {
		version: 2 as const,
		profiles: {
			iem: heads.map(({ id }) => item(id, 'like')),
			headphone: iems.map(({ id }) => item(id, 'neutral'))
		}
	};
	const catalogs = {
		iem: new CatalogIdentity({ products: iems, measurements: [] }),
		headphone: new CatalogIdentity({ products: heads, measurements: [] })
	};
	const migrated = migrateProfile(profile, catalogs);
	expect(migrated.profile.profiles).toEqual({
		iem: profile.profiles.headphone,
		headphone: profile.profiles.iem
	});
	expect(parseProfile(JSON.stringify(migrated.profile))).toEqual(migrated.profile);
	expect(migrated.messages).toHaveLength(400);
	expect(migrated.messages.every((message) => message.includes(': moved to '))).toBe(true);
	expect(migrateProfile(migrated.profile, catalogs).changed).toBe(false);
});

test('rejected outgoing moves reserve their origin capacity before accepting incoming moves', () => {
	const iems = Array.from({ length: 201 }, (_, i) => ({ id: `i-${i}`, brand: 'Fixture', model: `IEM ${i}` }));
	const heads = Array.from({ length: 200 }, (_, i) => ({
		id: `h-${i}`,
		brand: 'Fixture',
		model: `Headphone ${i}`
	}));
	const catalogs = {
		iem: new CatalogIdentity({ products: iems, measurements: [] }),
		headphone: new CatalogIdentity({ products: heads, measurements: [] })
	};
	const profile = {
		version: 2 as const,
		profiles: {
			iem: [...iems.slice(0, 199).map(({ id }) => item(id, 'like')), item('h-0', 'love')],
			headphone: [
				...heads.slice(1, 199).map(({ id }) => item(id, 'neutral')),
				item('i-199', 'like'),
				item('i-200', 'like')
			]
		}
	};
	const migrated = migrateProfile(profile, catalogs);
	expect(migrated.profile.profiles.iem).toHaveLength(200);
	expect(migrated.profile.profiles.headphone).toHaveLength(200);
	expect(migrated.profile.profiles.iem.some(({ productId }) => productId === 'i-199')).toBe(true);
	expect(migrated.profile.profiles.headphone.some(({ productId }) => productId === 'i-200')).toBe(true);
	expect(parseProfile(JSON.stringify(migrated.profile))).toEqual(migrated.profile);
});

test.each([
	'ref=misfiled-headphone&m=misfiled-measurement',
	'product=misfiled-headphone&measurement=misfiled-measurement',
	'p=misfiled-headphone&m=misfiled-measurement',
	'm=misfiled-measurement,headphone-measurement',
	'chart=misfiled-headphone',
	'chart=misfiled-measurement',
	`ratings=${encodeURIComponent(JSON.stringify([item('misfiled-headphone', 'love')]))}`
])('cross-form URLs resolve other-catalog redirects and clear incompatible rig controls: %s', (query) => {
	const url = new URL(
		`https://example.org/?${query}&rig=iem-711&sources=iem-source&sourceMode=only&edits=[]&depth=40&unknown=keep#main`
	);
	expect(needsOtherCatalog(url, catalog)).toBe(true);
	const migrated = migrateUrl(url, catalog, headphones);
	expect(migrated.url.searchParams.get('form')).toBe('headphones');
	for (const key of ['rig', 'sources', 'sourceMode', 'edits', 'depth'])
		expect(migrated.url.searchParams.has(key)).toBe(false);
	expect(migrated.url.searchParams.get('unknown')).toBe('keep');
	expect(migrated.url.hash).toBe('#main');
	expect(migrated.url.href).not.toContain('misfiled-');
	expect(migrated.messages).toEqual(['Fixture Headphone: opened in Headphones after a catalog update.']);
	expect(migrateUrl(migrated.url, headphones, catalog).changed).toBe(false);
});

test('reverse-form links recover explicit split ownership, while mixed or unresolved links stay intact', () => {
	const reverse = migrateUrl(
		new URL('https://example.org/?form=headphones&ref=split-old&m=old-split-variant'),
		headphones,
		catalog
	);
	expect(reverse.url.searchParams.has('form')).toBe(false);
	expect(reverse.url.searchParams.get('ref')).toBe('split-current');
	for (const query of [
		'p=current,headphone',
		'ref=unknown',
		'ref=headphone&ratings=invalid',
		'chart=current,headphone',
		'chart=unknown'
	]) {
		const url = new URL(`https://example.org/?${query}`);
		expect(migrateUrl(url, catalog, headphones).url.href).toBe(url.href);
	}
	expect(needsOtherCatalog(new URL('https://example.org/?m=variant,split-variant'), catalog)).toBe(false);
});
