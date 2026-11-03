import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Catalog, Manifest, Measurement, Product } from '#core/dataset/types.ts';
import { errorMessage } from './common.ts';
import { identity, type KnownBrand } from './transform.ts';

/** Read before publication can sweep the previous version. Missing history is non-fatal. */
export async function previousCatalogs(output: string) {
	const catalogs: Catalog[] = [];
	const warnings: string[] = [];
	let version: string | null = null;
	try {
		const manifest = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8')) as Manifest;
		version = manifest.version;
		for (const form of ['iem', 'headphone']) {
			try {
				catalogs.push(
					JSON.parse(
						gunzipSync(await readFile(resolve(output, version, `catalog-${form}.json.gz`))).toString()
					) as Catalog
				);
			} catch (error) {
				warnings.push(
					`Previous ${form} catalog unavailable; redirects from that catalog skipped: ${errorMessage(error)}`
				);
			}
		}
	} catch (error) {
		warnings.push(`Previous published catalogs unavailable; redirect diff skipped: ${errorMessage(error)}`);
	}
	for (const warning of warnings) console.warn(warning);
	return { catalogs, version, warnings };
}

const fileKey = (m: Measurement) =>
	JSON.stringify([m.sourceId, [...new Set(m.provenance.originalUrls)].sort()]);

/** Raw files identify candidates; variant metadata can disambiguate source-index reuse. */
function eligibleMatches(
	old: Measurement,
	matches: readonly Measurement[],
	exact?: Measurement
): readonly Measurement[] {
	if (exact) return [exact];
	if (matches.length < 2) return matches;
	const sameVariant = matches.filter(
		(m) => m.variant.kind === old.variant.kind && m.variant.label === old.variant.label
	);
	// Default selection may change; isDefault is deliberately not an identity constraint.
	return sameVariant.length ? sameVariant : matches;
}

/** Product resolution is separate from measurement resolution; ambiguous rows may share one parent. */
export function buildRedirects(
	previous: readonly Catalog[],
	current: readonly Catalog[],
	rules: {
		aliases?: Record<string, string>;
		productAliases?: Record<string, string>;
		knownBrands?: readonly KnownBrand[];
	} = {}
) {
	const products = new Map(current.flatMap((c) => c.products.map((p) => [p.id, c] as const)));
	const currentProducts = new Map(current.flatMap((c) => c.products.map((p) => [p.id, p] as const)));
	const currentRows = current.flatMap((c) => c.measurements);
	const currentById = new Map(currentRows.map((m) => [m.id, m]));
	const currentByProduct = Map.groupBy(currentRows, (m) => m.productId);
	const currentKey = (p: Product, rows: readonly Measurement[]) => {
		const keys = new Set(
			rows.map(
				(m) =>
					identity(
						p.brand,
						p.model,
						p.form,
						rules.aliases ?? {},
						rules.productAliases ?? {},
						rules.knownBrands ?? [],
						m.sourceId
					).key
			)
		);
		return keys.size === 1 ? keys.values().next().value : undefined;
	};
	const measurements = new Map(current.flatMap((c) => c.measurements.map((m) => [m.id, c] as const)));
	const byFile = Map.groupBy(
		current.flatMap((c) => c.measurements),
		fileKey
	);
	const productMoves = new Map<string, string>();
	const measurementMoves = new Map<string, string>();
	const splits: {
		productId: string;
		product: string;
		targets: { productId: string; formerDefaults: number; formerMeasurements: number }[];
		target: string | null;
		reason: string;
	}[] = [];
	const ambiguousMeasurements: string[] = [];
	for (const catalog of previous) {
		const byProduct = Map.groupBy(catalog.measurements, (m) => m.productId);
		for (const product of catalog.products) {
			const targets = new Map<string, { formerDefaults: number; formerMeasurements: number }>();
			for (const m of byProduct.get(product.id) ?? []) {
				const matches = eligibleMatches(m, byFile.get(fileKey(m)) ?? [], currentById.get(m.id));
				const match = matches.length === 1 ? matches[0] : undefined;
				if (!measurements.has(m.id)) {
					if (match) measurementMoves.set(m.id, match.id);
					else if (matches.length > 1) ambiguousMeasurements.push(m.id);
				}
				const destinations = new Set(matches.map((row) => row.productId));
				if (destinations.size !== 1) continue;
				const destination = destinations.values().next().value;
				if (!destination) continue;
				const votes = targets.get(destination) ?? { formerDefaults: 0, formerMeasurements: 0 };
				if (m.variant.kind === 'default') votes.formerDefaults++;
				votes.formerMeasurements++;
				targets.set(destination, votes);
			}
			if (products.has(product.id)) continue;
			const ranked = [...targets].sort(
				([a, av], [b, bv]) =>
					bv.formerDefaults - av.formerDefaults ||
					bv.formerMeasurements - av.formerMeasurements ||
					a.localeCompare(b, 'en')
			);
			const first = ranked[0];
			const defaultLeaders = ranked.filter(([, votes]) => votes.formerDefaults === first?.[1].formerDefaults);
			const countLeaders = defaultLeaders.filter(
				([, votes]) => votes.formerMeasurements === first?.[1].formerMeasurements
			);
			let target: string | undefined;
			let reason = 'unmapped: tied measurements and no unique current identity';
			if (defaultLeaders.length === 1) {
				target = first?.[0];
				reason =
					ranked.length === 1
						? 'unique destination product'
						: 'strict plurality of former default measurements';
			} else if (countLeaders.length === 1) {
				target = first?.[0];
				reason = 'strict plurality of former measurements';
			} else {
				const oldKey = currentKey(product, byProduct.get(product.id) ?? []);
				const identityMatches = countLeaders.filter(([id]) => {
					const candidate = currentProducts.get(id);
					return (
						oldKey !== undefined &&
						candidate &&
						currentKey(candidate, currentByProduct.get(id) ?? []) === oldKey
					);
				});
				if (identityMatches.length === 1) {
					target = identityMatches[0]?.[0];
					reason = 'unique recomputed current identity';
				}
			}
			if (target) productMoves.set(product.id, target);
			if (ranked.length > 1)
				splits.push({
					productId: product.id,
					product: `${product.brand} ${product.model}`,
					targets: ranked.map(([productId, votes]) => ({ productId, ...votes })),
					target: target ?? null,
					reason
				});
		}
	}
	const collapse = (
		kind: 'products' | 'measurements',
		live: Map<string, Catalog>,
		moves: Map<string, string>
	) => {
		const links = new Map(previous.flatMap((c) => Object.entries(c.redirects?.[kind] ?? {})));
		for (const [from, to] of moves) links.set(from, to);
		for (const from of links.keys()) {
			if (live.has(from)) continue;
			const visited = new Set<string>();
			let target: string | undefined = from;
			while (target && !live.has(target) && !visited.has(target)) {
				visited.add(target);
				target = links.get(target);
			}
			const catalog = target ? live.get(target) : undefined;
			if (catalog && target) {
				catalog.redirects ??= { products: {}, measurements: {} };
				catalog.redirects[kind][from] = target;
			}
		}
	};
	collapse('products', products, productMoves);
	collapse('measurements', measurements, measurementMoves);
	return {
		products: productMoves.size,
		measurements: measurementMoves.size,
		splits,
		ambiguousMeasurements,
		forms: current.map((c) => ({
			form: c.form,
			products: Object.keys(c.redirects?.products ?? {}).length,
			measurements: Object.keys(c.redirects?.measurements ?? {}).length
		}))
	};
}
