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
	it('rejects unreconciled multiple defaults instead of silently choosing a stable id', () => {
		const input = rows(2);
		const first = input[0];
		if (!first) throw new Error('Missing fixture');
		expect(() =>
			statisticsProducts([...input, { ...first, measurement: { ...first.measurement, id: 'another' } }])
		).toThrow('multiple defaults');
	});
	it('records the pooled uncorrected held-out median against an independent linear-slope expectation', () => {
		const input = rows(3);
		for (const row of input) {
			const product = Number(row.measurement.productId.slice('product-'.length));
			const slope = product === 2 ? 3 : product;
			if (row.measurement.sourceId === 'b')
				row.rank.values = Float64Array.from(RANK_GRID, (_, i) => 85 + product + (slope * i) / 12);
		}
		const stats = rankStatistics(input);
		// Uniformly spaced log-Hz indices 0..n-1 have variance (n²-1)/12.
		// Pair slopes are 0, 1 and 3 dB/oct: median RMS is this SD; mean is 4/3 times it.
		const expected = Math.sqrt((RANK_SIZE ** 2 - 1) / 12) / 12;
		expect(stats.harmonisation?.pairs).toBe(3);
		expect(stats.harmonisation?.meanBefore).toBeCloseTo((4 * expected) / 3, 12);
		expect(stats.harmonisation?.medianBefore).toBeCloseTo(expected, 12);
	});
	it('uses one default per product/source, excludes single-source products and does not weight variants', () => {
		const original = rows(20),
			first = original[0];
		if (!first) throw new Error('Missing fixture');
		const variant = {
			...first,
			measurement: {
				...first.measurement,
				id: '!earlier-variant',
				variant: { ...first.measurement.variant, isDefault: false }
			},
			rank: { values: Float64Array.from(RANK_GRID, (hz) => 50 + 8 * Math.log2(hz / 1000)) }
		};
		const duplicate = {
			...first,
			measurement: { ...first.measurement, id: 'zz-last' },
			rank: { values: Float64Array.from(RANK_GRID, (hz) => 100 - 6 * Math.log2(hz / 1000)) }
		};
		const single = { ...first, measurement: { ...first.measurement, productId: 'single' } };
		expect(() => statisticsProducts([duplicate, variant, ...original, single])).toThrow('multiple defaults');
		const expanded = [variant, ...original, single];
		expect(statisticsProducts(expanded)).toHaveLength(20);
		expect(statisticsProducts(expanded).every((p) => p.measurements.length === 2)).toBe(true);
		expect(
			statisticsProducts(expanded)
				.find((p) => p.id === first.measurement.productId)
				?.measurements.find((m) => m.source === first.measurement.sourceId)?.curve
		).toBe(first.rank.values);
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
		expect(stats.harmonisation?.medianBefore).toBeNull();
		expect(rankStatistics(rows(19)).support?.status).toBe('low');
		const bytes = encodePack({
			kind: 'rank',
			partition: 'iem-711',
			points: RANK_SIZE,
			curves: [],
			statistics: stats
		});
		expect(decodePack(bytes).statistics).toEqual(stats);
		const harmonisation = stats.harmonisation;
		if (!harmonisation) throw new Error('Missing validation');
		const invalid = { ...stats, harmonisation: { ...harmonisation, meanImprovement: NaN } };
		expect(() =>
			encodePack({ kind: 'rank', partition: 'iem-711', points: RANK_SIZE, curves: [], statistics: invalid })
		).toThrow('statistics');
		expect(() =>
			encodePack({
				kind: 'rank',
				partition: 'iem-711',
				points: RANK_SIZE,
				curves: [],
				statistics: { ...stats, harmonisation: { ...harmonisation, medianBefore: NaN } }
			})
		).toThrow('statistics');
	});
});
