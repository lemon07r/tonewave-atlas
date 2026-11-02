import type { CatalogIdentity } from './identity.ts';
import { parseProfile, strength, type Profile, type WorkspaceItem } from '#lib/profile/profile.ts';

const active = (item: WorkspaceItem) => ['love', 'like', 'dislike'].includes(item.rating);

/** An explicit surviving measurement can disambiguate a split with no product redirect. */
export function canonicalItem(item: WorkspaceItem, catalog: CatalogIdentity): WorkspaceItem {
	const productId = catalog.productId(item.productId);
	const measurementId = item.measurementId ? catalog.measurementId(item.measurementId) : undefined;
	const owner = measurementId ? catalog.measurementProduct(measurementId) : undefined;
	return {
		...item,
		productId: productId ?? owner ?? item.productId,
		...(item.measurementId ? { measurementId: measurementId ?? item.measurementId } : {})
	};
}

export function migrateItems(items: readonly WorkspaceItem[], catalog: CatalogIdentity) {
	const groups = new Map<string, { item: WorkspaceItem; canonical: boolean }[]>();
	const messages: string[] = [];
	let droppedRating = false;
	for (const original of items) {
		const item = canonicalItem(original, catalog);
		if (
			!catalog.productId(item.productId) ||
			(item.measurementId &&
				(!catalog.measurementId(item.measurementId) ||
					catalog.measurementProduct(item.measurementId) !== item.productId))
		)
			messages.push(
				`${catalog.name(item.productId)}: this item could not be resolved in the current catalog. It has been kept.`
			);
		const group = groups.get(item.productId) ?? [];
		group.push({ item, canonical: original.productId === item.productId });
		groups.set(item.productId, group);
	}
	const merged: WorkspaceItem[] = [];
	for (const group of groups.values()) {
		const rated = group.filter(({ item }) => active(item));
		const candidates = rated.length ? rated : group;
		// Decide the winning rating before combining evidence, so three-way collisions
		// cannot discard evidence that belongs to the eventual canonical winner.
		const winner = candidates.find(({ canonical }) => canonical) ?? candidates[0];
		if (!winner) continue;
		const preferred = winner.item;
		const same = group.filter(({ item }) => item.rating === preferred.rating).map(({ item }) => item);
		const measurementId = preferred.measurementId ?? same.find((item) => item.measurementId)?.measurementId;
		merged.push({
			...preferred,
			strength: strength(preferred.rating),
			soundRelated: same.every((item) => item.soundRelated),
			...(measurementId ? { measurementId } : {}),
			...(same.some((item) => item.likedAspects)
				? { likedAspects: [...new Set(same.flatMap((item) => item.likedAspects ?? []))] }
				: {}),
			...(same.some((item) => item.dislikeReasons)
				? { dislikeReasons: [...new Set(same.flatMap((item) => item.dislikeReasons ?? []))] }
				: {})
		});
		for (const { item } of rated) {
			if (item.rating === preferred.rating) continue;
			droppedRating = true;
			messages.push(
				`${catalog.name(item.productId)}: a duplicate rating from an older link was dropped (${item.rating}).`
			);
		}
	}
	return {
		items: merged,
		messages: [...new Set(messages)],
		droppedRating
	};
}

export function migrateProfile(
	profile: Profile,
	catalogs: Partial<Record<'iem' | 'headphone', CatalogIdentity>>
) {
	const next: Profile = { ...profile, profiles: { ...profile.profiles } };
	const messages: string[] = [];
	let droppedRating = false;
	for (const form of ['iem', 'headphone'] as const) {
		const catalog = catalogs[form];
		if (!catalog) continue;
		const migrated = migrateItems(profile.profiles[form], catalog);
		next.profiles[form] = migrated.items;
		messages.push(...migrated.messages);
		droppedRating ||= migrated.droppedRating;
	}
	return {
		profile: next,
		messages: [...new Set(messages)],
		droppedRating,
		changed: JSON.stringify(next) !== JSON.stringify(profile)
	};
}

/** Rewrite only identity parameters; retain unrelated controls, unknown ids, and the hash. */
export function migrateUrl(url: URL, catalog: CatalogIdentity) {
	const next = new URL(url.href);
	const params = next.searchParams;
	const messages: string[] = [];
	let droppedRating = false;
	// Even setting the same value re-encodes the whole query and can trigger a stale navigation.
	function setChanged(key: string, value: string) {
		if (params.get(key) !== value) params.set(key, value);
	}
	function resolve(id: string, kind: 'product' | 'measurement' | 'either'): string {
		const current =
			kind === 'product'
				? catalog.productId(id)
				: kind === 'measurement'
					? catalog.measurementId(id)
					: (catalog.productId(id) ?? catalog.measurementId(id));
		if (!current && id)
			messages.push(
				`${catalog.name(id)}: this item could not be resolved in the current catalog. It has been kept.`
			);
		return current ?? id;
	}
	for (const key of ['ref', 'product']) {
		const id = params.get(key);
		if (!id) continue;
		const measurement = params.get(key === 'ref' ? 'm' : 'measurement');
		const owner = measurement ? catalog.measurementProduct(measurement) : undefined;
		setChanged(key, !catalog.productId(id) && owner ? owner : resolve(id, 'product'));
	}
	for (const [key, kind] of [
		['refs', 'product'],
		['p', 'product'],
		['measurement', 'measurement'],
		['m', 'measurement'],
		['chart', 'either'],
		['diff', 'either']
	] as const) {
		const ids = params.get(key);
		if (ids) setChanged(key, [...new Set(ids.split(',').map((id) => resolve(id, kind)))].join(','));
	}
	if (params.has('ratings')) {
		try {
			const parsed = parseProfile(
				JSON.stringify({
					version: 2,
					profiles: { iem: JSON.parse(params.get('ratings') ?? '[]') as unknown, headphone: [] }
				})
			);
			const migrated = migrateItems(parsed.profiles.iem, catalog);
			setChanged('ratings', JSON.stringify(migrated.items));
			messages.push(...migrated.messages);
			droppedRating = migrated.droppedRating;
		} catch {
			// Existing strict workspace parsing owns malformed ratings; do not repair or discard them.
		}
	}
	return { url: next, changed: next.href !== url.href, messages: [...new Set(messages)], droppedRating };
}
