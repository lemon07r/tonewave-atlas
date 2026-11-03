import type { CatalogIdentity } from './identity.ts';
import {
	parseProfile,
	PROFILE_LIMIT,
	strength,
	type Profile,
	type WorkspaceItem
} from '#lib/profile/profile.ts';
import type { Form } from '#core/dataset/types.ts';

const active = (item: WorkspaceItem) => ['love', 'like', 'dislike'].includes(item.rating);
const formName = (form: Form) => (form === 'iem' ? 'IEMs' : 'Headphones');
type IdentityItem = Pick<WorkspaceItem, 'productId' | 'measurementId'> & { either?: boolean };

/** Explicit measurement ownership may resolve a split product, but never guess from its name. */
function hasIdentity(item: IdentityItem, catalog: CatalogIdentity): boolean {
	if (item.either) return !!(catalog.productId(item.productId) ?? catalog.measurementProduct(item.productId));
	const product =
		catalog.productId(item.productId) ??
		(item.measurementId ? catalog.measurementProduct(item.measurementId) : undefined);
	return !!product && (!item.measurementId || catalog.measurementProduct(item.measurementId) === product);
}

function urlItems(url: URL): IdentityItem[] | undefined {
	const params = url.searchParams;
	const items: IdentityItem[] = [];
	for (const [key, measurementKey] of [
		['ref', 'm'],
		['product', 'measurement']
	] as const) {
		const productId = params.get(key),
			measurementId = params.get(measurementKey);
		if (productId) items.push({ productId, ...(measurementId ? { measurementId } : {}) });
		else if (measurementId)
			for (const id of measurementId.split(',').filter(Boolean))
				items.push({ productId: '', measurementId: id });
	}
	for (const key of ['p', 'refs'])
		for (const productId of (params.get(key) ?? '').split(',').filter(Boolean)) items.push({ productId });
	for (const key of ['chart', 'diff'])
		for (const id of (params.get(key) ?? '').split(',').filter(Boolean))
			items.push({ productId: id, either: true });
	if (params.has('ratings')) {
		try {
			items.push(
				...parseProfile(
					JSON.stringify({
						version: 2,
						profiles: { iem: JSON.parse(params.get('ratings') ?? '[]') as unknown, headphone: [] }
					})
				).profiles.iem
			);
		} catch {
			return undefined; /* Never change form around malformed shared evidence. */
		}
	}
	return items;
}

export function needsOtherCatalog(url: URL, catalog: CatalogIdentity): boolean {
	return (urlItems(url) ?? []).some((item) => !hasIdentity(item, catalog));
}

export function profileNeedsOtherCatalog(profile: Profile, form: Form, catalog: CatalogIdentity): boolean {
	const other = form === 'iem' ? 'headphone' : 'iem';
	return (
		profile.profiles[other].length > 0 || profile.profiles[form].some((item) => !hasIdentity(item, catalog))
	);
}

/** A redirected measurement adopts its surviving owner, matching the engine's split policy. */
export function canonicalItem(item: WorkspaceItem, catalog: CatalogIdentity): WorkspaceItem {
	const productId = catalog.productId(item.productId);
	const measurementId = item.measurementId ? catalog.measurementId(item.measurementId) : undefined;
	const owner = measurementId ? catalog.measurementProduct(measurementId) : undefined;
	const movedOwner = measurementId !== item.measurementId ? owner : undefined;
	return {
		...item,
		productId: movedOwner ?? productId ?? owner ?? item.productId,
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

export function migrateProfile(profile: Profile, catalogs: Partial<Record<Form, CatalogIdentity>>) {
	const next: Profile = { ...profile, profiles: { ...profile.profiles } };
	const messages: string[] = [];
	let droppedRating = false;
	const moves: { from: Form; to: Form; index: number; item: WorkspaceItem; accepted: boolean }[] = [];
	for (const form of ['iem', 'headphone'] as const) {
		const current = catalogs[form],
			otherForm = form === 'iem' ? 'headphone' : 'iem',
			other = catalogs[otherForm];
		if (!current || !other) continue;
		profile.profiles[form].forEach((item, index) => {
			if (!hasIdentity(item, current) && hasIdentity(item, other))
				moves.push({ from: form, to: otherForm, index, item, accepted: true });
		});
	}
	const staying = (form: Form) =>
		profile.profiles[form].filter(
			(_, index) => !moves.some((move) => move.accepted && move.from === form && move.index === index)
		);
	// Plan both directions first. A rejected incoming move stays at its origin, which may
	// in turn consume space there; only reject moves, so this loop always terminates.
	let rejected: boolean;
	do {
		rejected = false;
		for (const form of ['iem', 'headphone'] as const) {
			const catalog = catalogs[form];
			if (!catalog) continue;
			const retained = new Set(staying(form).map((row) => canonicalItem(row, catalog).productId));
			const incoming = moves.filter((move) => move.accepted && move.to === form);
			const occupied = new Set([
				...retained,
				...incoming.map(({ item }) => canonicalItem(item, catalog).productId)
			]);
			if (occupied.size <= PROFILE_LIMIT) continue;
			const last = incoming.findLast(({ item }) => !retained.has(canonicalItem(item, catalog).productId));
			if (!last) continue;
			const id = canonicalItem(last.item, catalog).productId;
			for (const move of incoming)
				if (canonicalItem(move.item, catalog).productId === id) move.accepted = false;
			rejected = true;
		}
	} while (rejected);
	for (const move of moves) {
		const catalog = catalogs[move.to];
		if (!catalog) continue;
		const name = catalog.name(canonicalItem(move.item, catalog).productId);
		messages.push(
			move.accepted
				? `${name}: moved to the ${formName(move.to)} profile after a catalog update.`
				: `${name}: could not move to ${formName(move.to)} because that profile is full. It has been kept.`
		);
	}
	for (const form of ['iem', 'headphone'] as const) {
		const catalog = catalogs[form];
		if (!catalog) continue;
		const migrated = migrateItems(
			[
				...staying(form),
				...moves.filter((move) => move.accepted && move.to === form).map(({ item }) => item)
			],
			catalog
		);
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

export interface UrlMigration {
	url: URL;
	changed: boolean;
	messages: string[];
	droppedRating: boolean;
}

/** Resolve identities in place; switch form only when every selected identity belongs to the other form. */
export function migrateUrl(url: URL, catalog: CatalogIdentity, other?: CatalogIdentity): UrlMigration {
	const identities = urlItems(url);
	if (
		other &&
		identities?.length &&
		identities.every((item) => !hasIdentity(item, catalog) && hasIdentity(item, other))
	) {
		const next = new URL(url.href);
		const form = url.searchParams.get('form') === 'headphones' ? 'iem' : 'headphone';
		if (form === 'iem') next.searchParams.delete('form');
		else next.searchParams.set('form', 'headphones');
		for (const key of ['rig', 'sources', 'sourceMode', 'edits', 'depth']) next.searchParams.delete(key);
		const migrated = migrateUrl(next, other);
		const names = [
			...new Set(
				identities.map((item) =>
					other.name(
						other.productId(item.productId) ??
							(item.either ? other.measurementProduct(item.productId) : undefined) ??
							(item.measurementId ? other.measurementProduct(item.measurementId) : undefined) ??
							item.productId
					)
				)
			)
		];
		return {
			...migrated,
			changed: true,
			messages: [
				...migrated.messages,
				`${names.join(', ')}: opened in ${formName(form)} after a catalog update.`
			]
		};
	}
	const next = new URL(url.href);
	const params = next.searchParams;
	const messages: string[] = [];
	let droppedRating = false;
	// Even setting the same value re-encodes the whole query and can trigger a stale navigation.
	function setChanged(key: string, value: string) {
		if (params.get(key) !== value || params.getAll(key).length > 1) params.set(key, value);
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
		const moved = measurement && catalog.measurementId(measurement) !== measurement;
		setChanged(key, owner && (moved || !catalog.productId(id)) ? owner : resolve(id, 'product'));
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
