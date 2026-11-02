import { describe, expect, it } from 'vitest';
import { RANK_GRID, RANK_SIZE } from '#core/grid.ts';
import { encodePack, decodePack } from '#core/dataset/codec.ts';
import { medianSpreadByBand, rankStatistics, statisticsProducts } from './statistics.ts';

function rows(products: number, tilt = 0) {
	return Array.from({ length: products }, (_, p) =>
		['a', 'b'].map((source, s) => ({
			measurement: {
				id: `${p}-${source}`,
				productId: `product-${p}`,
				sourceId: source,
				variant: {
					id: `v-${p}-${source}`,
					file: 'file',
					label: '',
					kind: 'default' as const,
					isDefault: true
				}
			},
			rank: {
				values: Float64Array.from(
					RANK_GRID,
					(hz) => 80 + p + s * 5 + (s ? -1 : 1) * tilt * Math.log2(hz / 1000)
				)
			}
		}))
	).flat();
}

describe('rank-grid statistics integration', () => {
	it('uses one default per product/source, excludes single-source products and does not weight variants', () => {
		const original = rows(20),
			first = original[0];
		if (!first) throw new Error('Missing fixture');
		const variant = {
			...first,
			measurement: {
				...first.measurement,
				id: 'other',
				variant: { ...first.measurement.variant, isDefault: false }
			}
		};
		const duplicate = { ...first, measurement: { ...first.measurement, id: 'zz-last' } };
		const single = { ...first, measurement: { ...first.measurement, productId: 'single' } };
		const expanded = [...original, variant, duplicate, single];
		expect(statisticsProducts(expanded)).toHaveLength(20);
		expect(statisticsProducts(expanded).every((p) => p.measurements.length === 2)).toBe(true);
		expect(rankStatistics(expanded)).toEqual(rankStatistics(original));
	});
	it('gives zero shape spread for gain-only differences and balances products', () => {
		const stats = rankStatistics(rows(20));
		expect(stats.support).toMatchObject({
			status: 'sufficient',
			multiSourceProducts: 20,
			sources: 2,
			sourceProducts: { a: 20, b: 20 }
		});
		expect(stats.spread.every((v) => v !== null && Math.abs(v) < 1e-10)).toBe(true);
		expect(stats.populationMedian.every((v) => v !== null && Math.abs(v - 80) < 1e-10)).toBe(true);
		expect(stats.harmonisation?.pairs).toBe(20);
	});
	it('stores five-fold and pooled held-out results, with beneficial correction for source tilts', () => {
		const input = rows(25, 0.5);
		const stats = rankStatistics(input);
		expect(stats.harmonisation?.foldCount).toBe(5);
		expect(stats.harmonisation?.folds).toHaveLength(5);
		expect(stats.harmonisation?.pairs).toBe(25);
		expect(stats.harmonisation?.meanImprovement).toBeGreaterThan(0);
		expect(stats.harmonisation?.medianImprovement).toBeGreaterThan(0);
		expect(rankStatistics([...input].reverse())).toEqual(stats);
		expect(Object.values(medianSpreadByBand(stats)).every((v) => v !== null && v > 0)).toBe(true);
	});
	it('flags low support and serializes unsupported bins as null without zero-filling', () => {
		const stats = rankStatistics([]);
		expect(stats.support).toMatchObject({ status: 'low', multiSourceProducts: 0, minimumProducts: 20 });
		expect(stats.spread).toEqual(Array(RANK_SIZE).fill(null));
		expect(stats.harmonisation?.meanImprovement).toBeNull();
		expect(rankStatistics(rows(19)).support?.status).toBe('low');
		const bytes = encodePack({
			kind: 'rank',
			partition: 'iem-711',
			points: RANK_SIZE,
			curves: [],
			statistics: stats
		});
		expect(decodePack(bytes).statistics).toEqual(stats);
		if (!stats.harmonisation) throw new Error('Missing validation');
		const invalid = { ...stats, harmonisation: { ...stats.harmonisation, meanImprovement: NaN } };
		expect(() =>
			encodePack({ kind: 'rank', partition: 'iem-711', points: RANK_SIZE, curves: [], statistics: invalid })
		).toThrow('statistics');
	});
});
