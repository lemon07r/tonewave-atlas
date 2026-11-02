import { describe, expect, it } from 'vitest';
import { RANK_GRID } from '../grid.ts';
import { responseDistance } from './distance.ts';
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
		expect(result.foldCount).toBe(5);
		expect(result.folds).toHaveLength(5);
		expect(result.medianImprovement).toBeGreaterThan(0);
		// With a single product there is no training overlap: correction must be exactly the baseline.
		const single = validateSourceOffsets(products(1), RANK_GRID);
		expect(single.meanAfter).toBe(single.meanBefore);
	});
	it('excludes the entire hashed fold, not only the individual held-out product', () => {
		// Known FNV-1a vectors: a=3826002220 and c=3859557458 -> fold 0 for K=2; b -> fold 1.
		// No training fold has the held-out fold's sources, so no correction can be learned.
		const p = products(3).map((product, i) => ({
			...product,
			id: ['a', 'c', 'b'][i] ?? '',
			measurements: product.measurements.map((m) => ({
				...m,
				source: i === 2 ? `other-${m.source}` : m.source
			}))
		}));
		const result = validateSourceOffsets(p, RANK_GRID, 0, 2);
		expect(result.meanAfter).toBe(result.meanBefore);
		expect(result.medianImprovement).toBe(0);
		expect(result.folds.map((f) => [f.trainingProducts, f.heldOutProducts, f.pairs])).toEqual([
			[1, 2, 2],
			[2, 1, 1]
		]);
		expect(validateSourceOffsets([...p].reverse(), RANK_GRID, 0, 2)).toEqual(result);
	});
	it('reports pair-weighted means and the pooled pair median, including negative improvements', () => {
		const ids = ['a', 'b', 'c', 'd', 'e'];
		const p = ids.map((id, i) => ({
			id,
			measurements: products(1, [1, 2, 3, 4, 20][i])[0]?.measurements ?? []
		}));
		const result = validateSourceOffsets(p, RANK_GRID, 0, 2),
			improvements: number[] = [];
		for (let fold = 0; fold < 2; fold++) {
			// The known single-letter FNV hashes alternate even/odd: a,c,e vs b,d.
			const heldOut = p.filter((_, i) => i % 2 === fold),
				training = estimatePartitionStatistics(
					p.filter((_, i) => i % 2 !== fold),
					RANK_GRID,
					0
				);
			for (const product of heldOut) {
				const corrected = product.measurements.map((m) =>
					Float64Array.from(
						m.curve,
						(v, i) => v - (training.sourceOffsets.find((s) => s.source === m.source)?.curve[i] ?? 0)
					)
				);
				const before =
					responseDistance(product.measurements[0]?.curve ?? [], product.measurements[1]?.curve ?? [])
						?.distance ?? NaN;
				const after = responseDistance(corrected[0] ?? [], corrected[1] ?? [])?.distance ?? NaN;
				improvements.push(before - after);
			}
		}
		const sorted = [...improvements].sort((a, b) => a - b);
		expect(result.medianImprovement).toBeCloseTo(sorted[2] ?? NaN, 12);
		expect(result.meanImprovement).toBeCloseTo(improvements.reduce((s, d) => s + d, 0) / 5, 12);
		expect(result.meanImprovement).toBeCloseTo((result.meanBefore ?? 0) - (result.meanAfter ?? 0), 12);
		expect(improvements.some((d) => d < 0)).toBe(true);
		expect(result.folds.reduce((n, f) => n + f.pairs, 0)).toBe(result.pairs);
	});
	it('reports empty folds without fabricated results and validates fold counts', () => {
		const empty = validateSourceOffsets([], RANK_GRID);
		expect(empty.medianImprovement).toBeNull();
		expect(empty.folds.every((f) => f.pairs === 0 && f.improved === null)).toBe(true);
		expect(() => validateSourceOffsets(products(1), RANK_GRID, 10, 1)).toThrow(RangeError);
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
