import { describe, expect, it } from 'vitest';
import { RANK_GRID } from '../grid.ts';
import {
	estimatePartitionStatistics,
	validateSourceOffsets,
	type ProductMeasurements
} from './statistics.ts';

function products(n: number, bias = 1): ProductMeasurements[] {
	return Array.from({ length: n }, (_, id) => ({
		id: String(id),
		measurements: [
			{ source: 'a', curve: Float64Array.from(RANK_GRID, (_, i) => 70 + id + Math.sin(i / 20) * bias) },
			{ source: 'b', curve: Float64Array.from(RANK_GRID, (_, i) => 90 + id - Math.sin(i / 20) * bias) }
		]
	}));
}

describe('cross-source statistics', () => {
	it('removes arbitrary levels before spread and population estimation', () => {
		const p = products(4, 0),
			stats = estimatePartitionStatistics(p, RANK_GRID);
		expect(stats.spread.every((v) => Math.abs(v) < 1e-10)).toBe(true);
		expect(stats.populationMedian.every((v) => Math.abs(v - 70) < 1e-10)).toBe(true);
		expect(stats.spreadSupport[30]).toBe(4);
	});
	it('is robust to one product with a huge cross-source disagreement', () => {
		const clean = estimatePartitionStatistics(products(5), RANK_GRID),
			p = products(5);
		p.push(...products(1, 100).map((p) => ({ ...p, id: 'outlier' })));
		const dirty = estimatePartitionStatistics(p, RANK_GRID);
		expect(Array.from(dirty.spread)).toEqual(Array.from(clean.spread));
		expect(dirty.spread.some((v) => v > 0.5)).toBe(true);
	});
	it('does not double a two-source contrast and shrinks with support', () => {
		const unshrunk = estimatePartitionStatistics(products(6), RANK_GRID, 0),
			shrunk = estimatePartitionStatistics(products(6), RANK_GRID, 10);
		const a = unshrunk.sourceOffsets.find((s) => s.source === 'a'),
			b = unshrunk.sourceOffsets.find((s) => s.source === 'b');
		expect(a?.products).toBe(6);
		for (let i = 10; i < 100; i++) {
			expect((a?.curve[i] ?? 0) + (b?.curve[i] ?? 0)).toBeCloseTo(0, 10);
			expect(shrunk.sourceOffsets[0]?.curve[i]).toBeCloseTo(((a?.curve[i] ?? 0) * 6) / 16, 10);
		}
	});
	it('validates with the entire held-out product excluded', () => {
		const result = validateSourceOffsets(products(8), RANK_GRID);
		expect(result.pairs).toBe(8);
		expect(result.improved).toBe(true);
		expect(result.meanAfter).toBeLessThan(result.meanBefore ?? 0);
		// With a single product there is no training overlap: correction must be exactly the baseline.
		const single = validateSourceOffsets(products(1), RANK_GRID);
		expect(single.meanAfter).toBe(single.meanBefore);
	});
	it('returns missing uncertainty without overlap and reports fit sensitivity', () => {
		const p = products(1, 0)[0];
		if (!p) throw new Error('fixture');
		p.measurements = p.measurements.slice(0, 1);
		p.fitVariants = [new Float64Array(120), Float64Array.from(RANK_GRID, (_, i) => (i < 60 ? 2 : -2))];
		const stats = estimatePartitionStatistics([p], RANK_GRID);
		expect(stats.spread.every(Number.isNaN)).toBe(true);
		expect(stats.sourceOffsets).toEqual([]);
		expect(stats.fitSensitivity[0]?.meanDistance).toBeCloseTo(1, 10);
		expect(validateSourceOffsets([], RANK_GRID).meanAfter).toBeNull();
	});
});
