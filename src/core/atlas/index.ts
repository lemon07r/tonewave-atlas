import { median, type Curve } from '../analysis/common.ts';
import { distanceSummary } from '../analysis/distance.ts';
import type { CurvePack } from '../dataset/codec.ts';
import type { Catalog, Measurement, Partition, PartitionStatistics, Product } from '../dataset/types.ts';
import { RANK_GRID, RANK_SIZE } from '../grid.ts';
import type { CandidateInfo } from './types.ts';

export interface IndexedCurve {
	measurement: Measurement;
	values: Float64Array;
}
export interface Consensus {
	values: Float64Array;
	aligned: IndexedCurve[];
}
export interface AtlasCandidate {
	info: CandidateInfo;
	values: Float64Array;
	/** One aligned default consensus per reviewer, or the tuning measurement alone. */
	perSource: Float64Array[];
	/** Unaligned, already source-corrected defaults, retained for exact reviewer omission pooling. */
	consensusInputs?: readonly IndexedCurve[];
}
export interface PartitionIndex {
	partition: Partition;
	statistics: PartitionStatistics | null;
	/** At least one finite measurement bin received a finite published source offset. */
	harmonised: boolean;
	candidates: AtlasCandidate[];
	products: Map<string, AtlasCandidate>;
	measurements: Map<string, IndexedCurve>;
	matrix: Float32Array;
	sourceIds: readonly string[] | undefined;
	excludedSourceProducts: Set<string>;
}

/** Deterministic overlap medoid: most adequate partners, then smallest median shape distance,
 * then self coverage, then measurement id. Stable accumulation order makes permutations identical.
 * No extrapolation, and curves without adequate anchor overlap remain excluded.
 */
export function consensus(
	curves: readonly IndexedCurve[],
	frequencies: Curve,
	/** Optional memo for omissions of the same immutable curve pool on the same frequency grid. */
	pairDistances?: WeakMap<IndexedCurve, WeakMap<IndexedCurve, number | null>>
): Consensus | null {
	const options = { frequencies };
	const eligible = curves
		.filter((curve) => distanceSummary(curve.values, curve.values, options))
		.sort((a, b) => a.measurement.id.localeCompare(b.measurement.id));
	const scores = eligible.map((curve) => ({ curve, distances: [] as number[], points: 0 }));
	for (let i = 0; i < scores.length; i++) {
		const a = scores[i];
		if (!a) continue;
		a.points = distanceSummary(a.curve.values, a.curve.values, options)?.points ?? 0;
		for (let j = i + 1; j < scores.length; j++) {
			const b = scores[j];
			if (!b) continue;
			let partners = pairDistances?.get(a.curve);
			let distance = partners?.get(b.curve);
			if (distance === undefined) {
				distance = distanceSummary(a.curve.values, b.curve.values, options)?.distance ?? null;
				if (pairDistances) {
					if (!partners) {
						partners = new WeakMap();
						pairDistances.set(a.curve, partners);
					}
					partners.set(b.curve, distance);
				}
			}
			if (distance !== null) {
				a.distances.push(distance);
				b.distances.push(distance);
			}
		}
	}
	const anchor = scores
		.map((s) => ({ ...s, typical: s.distances.length ? median(s.distances) : Infinity }))
		.sort(
			(a, b) =>
				b.distances.length - a.distances.length ||
				a.typical - b.typical ||
				b.points - a.points ||
				a.curve.measurement.id.localeCompare(b.curve.measurement.id)
		)[0]?.curve;
	if (!anchor) return null;
	const aligned: IndexedCurve[] = [];
	for (const curve of [anchor, ...eligible.filter((c) => c !== anchor)]) {
		const d = distanceSummary(curve.values, anchor.values, options);
		if (d)
			aligned.push({
				measurement: curve.measurement,
				values: Float64Array.from(curve.values, (v) => v - d.offset)
			});
	}
	if (!aligned.length) return null;
	return {
		values: Float64Array.from(frequencies, (_, i) => median(aligned.map((c) => c.values[i] ?? NaN))),
		aligned
	};
}

export function priceRange(prices: readonly Measurement['price'][]): [number, number] | null {
	const usd = prices.flatMap((p) =>
		p?.usd !== null && p?.usd !== undefined && Number.isFinite(p.usd) ? [p.usd] : []
	);
	return usd.length ? [Math.min(...usd), Math.max(...usd)] : null;
}

function info(
	catalog: Catalog,
	product: Product,
	measurements: Measurement[],
	kind: 'default' | 'tuning'
): CandidateInfo {
	const first = measurements[0];
	const sourceIds = new Set(measurements.map((m) => m.sourceId));
	const prices = measurements.flatMap((m) => (m.price ? [m.price] : []));
	return {
		id: kind === 'default' ? product.id : (first?.id ?? product.id),
		product: {
			id: product.id,
			brand: product.brand,
			model: product.model,
			form: product.form,
			...(product.modified ? { modified: product.modified } : {}),
			...(product.baseProductId ? { baseProductId: product.baseProductId } : {})
		},
		kind,
		variantLabel: kind === 'tuning' ? (first?.variant.label ?? '') : null,
		measurementIds: measurements.map((m) => m.id),
		sources: catalog.sources.filter((s) => sourceIds.has(s.id)),
		prices,
		priceUsd: priceRange(prices)
	};
}

/** Partition-local only. No fallback from fit/setup/unit/unknown measurements to product defaults. */
export function buildPartitionIndex(
	catalog: Catalog,
	partition: Partition,
	pack: CurvePack,
	harmonise = false,
	sourceIds?: readonly string[]
): PartitionIndex {
	if (pack.kind !== 'rank' || pack.partition !== partition.id || pack.points !== RANK_SIZE)
		throw new Error('Rank pack does not match partition/grid');
	const statistics = pack.statistics ?? partition.statistics;
	const metadata = new Map(
		catalog.measurements.filter((m) => m.partition === partition.id).map((m) => [m.id, m])
	);
	const excludedSourceProducts = new Set<string>();
	const measurements = new Map<string, IndexedCurve>();
	let harmonised = false;
	const byProduct = new Map<string, IndexedCurve[]>();
	for (const curve of pack.curves) {
		const measurement = metadata.get(curve.measurementId);
		if (!measurement || curve.channel !== 'avg') continue;
		if (sourceIds && !sourceIds.includes(measurement.sourceId)) {
			excludedSourceProducts.add(measurement.productId);
			continue;
		}
		if (measurements.has(measurement.id)) throw new Error('Duplicate rank measurement');
		const offset = harmonise ? statistics?.sourceOffsets[measurement.sourceId] : undefined;
		const values = Float64Array.from(curve.values, (v, i) => {
			if (Number.isFinite(v) && Number.isFinite(offset?.[i])) harmonised = true;
			return v - (Number.isFinite(offset?.[i]) ? (offset?.[i] ?? 0) : 0);
		});
		const row = { measurement, values };
		measurements.set(measurement.id, row);
		const group = byProduct.get(measurement.productId) ?? [];
		group.push(row);
		byProduct.set(measurement.productId, group);
	}
	const candidates: AtlasCandidate[] = [];
	const products = new Map<string, AtlasCandidate>();
	for (const product of catalog.products) {
		const rows = byProduct.get(product.id) ?? [];
		const defaults = rows.filter((c) => c.measurement.variant.kind === 'default');
		const pooled = consensus(defaults, RANK_GRID);
		if (pooled) {
			const perSource: Float64Array[] = [];
			for (const sourceId of new Set(pooled.aligned.map((c) => c.measurement.sourceId))) {
				const source = consensus(
					pooled.aligned.filter((c) => c.measurement.sourceId === sourceId),
					RANK_GRID
				);
				if (source) perSource.push(source.values);
			}
			const candidate = {
				info: info(
					catalog,
					product,
					pooled.aligned.map((c) => c.measurement),
					'default'
				),
				values: pooled.values,
				perSource,
				consensusInputs: defaults
			};
			candidates.push(candidate);
			products.set(product.id, candidate);
		}
		for (const row of rows.filter((c) => c.measurement.variant.kind === 'tuning')) {
			candidates.push({
				info: info(catalog, product, [row.measurement], 'tuning'),
				values: row.values,
				perSource: [row.values]
			});
		}
	}
	const matrix = new Float32Array(candidates.length * RANK_SIZE);
	candidates.forEach((c, i) => {
		matrix.set(c.values, i * RANK_SIZE);
	});
	return {
		partition,
		statistics,
		harmonised,
		candidates,
		products,
		measurements,
		matrix,
		sourceIds,
		excludedSourceProducts
	};
}
