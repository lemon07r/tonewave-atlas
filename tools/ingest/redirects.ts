import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Catalog, Manifest, Measurement } from '#core/dataset/types.ts';
import { errorMessage } from './common.ts';

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

/** Exact file identity only; product splits use a unique plurality of former defaults. */
export function buildRedirects(previous: readonly Catalog[], current: readonly Catalog[]) {
	const products = new Map(current.flatMap((c) => c.products.map((p) => [p.id, c] as const)));
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
		targets: { productId: string; formerDefaults: number }[];
		target: string | null;
		reason: string;
	}[] = [];
	const ambiguousMeasurements: string[] = [];
	for (const catalog of previous) {
		const byProduct = Map.groupBy(catalog.measurements, (m) => m.productId);
		for (const product of catalog.products) {
			const targets = new Map<string, number>();
			for (const m of byProduct.get(product.id) ?? []) {
				const matches = byFile.get(fileKey(m)) ?? [];
				const match = matches.length === 1 ? matches[0] : undefined;
				if (!match) {
					if (matches.length > 1 && !measurements.has(m.id)) ambiguousMeasurements.push(m.id);
					continue;
				}
				if (!measurements.has(m.id)) measurementMoves.set(m.id, match.id);
				targets.set(
					match.productId,
					(targets.get(match.productId) ?? 0) + (m.variant.kind === 'default' ? 1 : 0)
				);
			}
			if (products.has(product.id)) continue;
			const ranked = [...targets].sort(([a, av], [b, bv]) => bv - av || a.localeCompare(b, 'en'));
			const first = ranked[0];
			const target =
				ranked.length === 1
					? first?.[0]
					: first && first[1] > 0 && first[1] > (ranked[1]?.[1] ?? 0)
						? first[0]
						: undefined;
			if (target) productMoves.set(product.id, target);
			if (ranked.length > 1)
				splits.push({
					productId: product.id,
					product: `${product.brand} ${product.model}`,
					targets: ranked.map(([productId, formerDefaults]) => ({ productId, formerDefaults })),
					target: target ?? null,
					reason: target
						? 'strict plurality of former default measurements'
						: 'unmapped: tied or absent former defaults'
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
