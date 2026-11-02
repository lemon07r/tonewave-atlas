import { RANK_GRID } from '#core/grid.ts';
import { BANDS, median } from '#core/analysis/common.ts';
import { responseDistance } from '#core/analysis/distance.ts';
import {
	estimatePartitionStatistics,
	validateSourceOffsets,
	type ProductMeasurements
} from '#core/analysis/statistics.ts';
import type { Measurement, PartitionStatistics } from '#core/dataset/types.ts';

/** Provisional reporting guard, not statistical confidence; see partition support in METHODOLOGY.md. */
const MIN_STATISTICS_PRODUCTS = 20;
interface RankMeasurement {
	measurement: Pick<Measurement, 'id' | 'productId' | 'sourceId' | 'variant'>;
	rank: { values: Float64Array };
}

/** Exactly one default rank curve per product/source; variants never gain population weight. */
export function statisticsProducts(curves: readonly RankMeasurement[]): ProductMeasurements[] {
	const products = new Map<string, Map<string, Float64Array>>();
	for (const row of [...curves].sort((a, b) => a.measurement.id.localeCompare(b.measurement.id, 'en'))) {
		if (!row.measurement.variant.isDefault) continue;
		const sources = products.get(row.measurement.productId) ?? new Map<string, Float64Array>();
		if (!sources.has(row.measurement.sourceId)) sources.set(row.measurement.sourceId, row.rank.values);
		products.set(row.measurement.productId, sources);
	}
	return [...products]
		.filter(([, sources]) => sources.size >= 2)
		.sort(([a], [b]) => a.localeCompare(b, 'en'))
		.map(([id, sources]) => ({
			id,
			measurements: [...sources]
				.sort(([a], [b]) => a.localeCompare(b, 'en'))
				.map(([source, curve]) => ({ source, curve }))
		}));
}

const finite = (values: ArrayLike<number>): (number | null)[] =>
	Array.from(values, (value) => (Number.isFinite(value) ? value : null));

/** Every product is held out once; finite source corrections preserve pairwise missing-data support. */
function heldOutBaseline(products: readonly ProductMeasurements[]): {
	pairs: number;
	medianBefore: number | null;
} {
	const distances: number[] = [];
	for (const product of products)
		for (let i = 0; i < product.measurements.length; i++)
			for (let j = i + 1; j < product.measurements.length; j++) {
				const a = product.measurements[i]?.curve,
					b = product.measurements[j]?.curve;
				if (!a || !b) continue;
				const distance = responseDistance(a, b, { frequencies: RANK_GRID });
				if (distance) distances.push(distance.distance);
			}
	const value = median(distances);
	return { pairs: distances.length, medianBefore: Number.isFinite(value) ? value : null };
}

export function rankStatistics(curves: readonly RankMeasurement[]): PartitionStatistics {
	const products = statisticsProducts(curves);
	const estimate = estimatePartitionStatistics(products, RANK_GRID);
	const harmonisation = validateSourceOffsets(products, RANK_GRID, 10, 5);
	const baseline = heldOutBaseline(products);
	if (baseline.pairs !== harmonisation.pairs)
		throw new Error('Held-out baseline pair support differs from harmonisation validation');
	const reason =
		products.length < MIN_STATISTICS_PRODUCTS
			? `Only ${products.length} multi-source products; at least ${MIN_STATISTICS_PRODUCTS} required for sufficient support`
			: !harmonisation.pairs
				? 'No valid held-out source pairs'
				: null;
	return {
		spread: finite(estimate.spread),
		populationMedian: finite(estimate.populationMedian),
		sourceOffsets: Object.fromEntries(estimate.sourceOffsets.map((s) => [s.source, finite(s.curve)])),
		support: {
			status: reason ? 'low' : 'sufficient',
			reason,
			minimumProducts: MIN_STATISTICS_PRODUCTS,
			multiSourceProducts: products.length,
			sources: new Set(products.flatMap((p) => p.measurements.map((m) => m.source))).size,
			spread: [...estimate.spreadSupport],
			sourceProducts: Object.fromEntries(estimate.sourceOffsets.map((s) => [s.source, s.products])),
			sourceBins: Object.fromEntries(estimate.sourceOffsets.map((s) => [s.source, [...s.support]]))
		},
		harmonisation: { ...harmonisation, medianBefore: baseline.medianBefore }
	};
}

export function medianSpreadByBand(statistics: PartitionStatistics): Record<string, number | null> {
	return Object.fromEntries(
		BANDS.map((band) => {
			const value = median(
				statistics.spread.filter(
					(v, i): v is number =>
						v !== null && (RANK_GRID[i] ?? 0) >= band.low && (RANK_GRID[i] ?? Infinity) < band.high
				)
			);
			return [band.id, Number.isFinite(value) ? value : null];
		})
	);
}
