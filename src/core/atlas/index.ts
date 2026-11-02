import { median, type Curve } from '../analysis/common.ts';
import { responseDistance } from '../analysis/distance.ts';
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
}
export interface PartitionIndex {
	partition: Partition;
	statistics: PartitionStatistics | null;
	candidates: AtlasCandidate[];
	products: Map<string, AtlasCandidate>;
	measurements: Map<string, IndexedCurve>;
	matrix: Float32Array;
}

/** Align to the first adequately covered curve by uniform-weight LS level, then median each bin. */
export function consensus(curves: readonly IndexedCurve[], frequencies: Curve): Consensus | null {
	const anchor = curves.find(
		(curve) => responseDistance(curve.values, curve.values, { frequencies }) !== null
	);
	if (!anchor) return null;
	const aligned: IndexedCurve[] = [];
	for (const curve of curves) {
		const d = responseDistance(curve.values, anchor.values, { frequencies });
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
		product: { id: product.id, brand: product.brand, model: product.model, form: product.form },
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
	harmonise = false
): PartitionIndex {
	if (pack.kind !== 'rank' || pack.partition !== partition.id || pack.points !== RANK_SIZE)
		throw new Error('Rank pack does not match partition/grid');
	const statistics = pack.statistics ?? partition.statistics;
	const metadata = new Map(
		catalog.measurements.filter((m) => m.partition === partition.id).map((m) => [m.id, m])
	);
	const measurements = new Map<string, IndexedCurve>();
	const byProduct = new Map<string, IndexedCurve[]>();
	for (const curve of pack.curves) {
		const measurement = metadata.get(curve.measurementId);
		if (!measurement || curve.channel !== 'avg') continue;
		if (measurements.has(measurement.id)) throw new Error('Duplicate rank measurement');
		const offset = harmonise ? statistics?.sourceOffsets[measurement.sourceId] : undefined;
		const values = Float64Array.from(
			curve.values,
			(v, i) => v - (Number.isFinite(offset?.[i]) ? (offset?.[i] ?? 0) : 0)
		);
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
				perSource
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
	return { partition, statistics, candidates, products, measurements, matrix };
}
