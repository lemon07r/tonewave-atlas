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
	it('preserves well-covered sources when the first source has sparse coverage', () => {
		const sparse = new Float64Array(120).fill(NaN);
		sparse.fill(70, 0, 20);
		const product = {
			id: 'sparse-first',
			measurements: [
				{ source: 'sparse', curve: sparse },
				{ source: 'full-a', curve: new Float64Array(120).fill(70) },
				{ source: 'full-b', curve: new Float64Array(120).fill(90) }
			]
		};
		const stats = estimatePartitionStatistics([product], RANK_GRID, 0);
		expect(stats.populationMedian.every((v) => Number.isFinite(v))).toBe(true);
		expect(stats.spread.every((v) => v === 0)).toBe(true);
		expect(stats.spreadSupport[60]).toBe(1);
		expect(stats.sourceOffsets.map((s) => s.source)).toEqual(['full-a', 'full-b']);
	});
	it('does not report a singleton fit variant as measured zero sensitivity', () => {
		const p = products(1, 0)[0];
		if (!p) throw new Error('fixture');
		p.fitVariants = [new Float64Array(120).fill(70)];
		const sensitivity = estimatePartitionStatistics([p], RANK_GRID).fitSensitivity[0];
		expect(sensitivity?.meanDistance).toBeNull();
		expect(sensitivity?.spread.every(Number.isNaN)).toBe(true);
	});
	it('rejects invalid shrinkage and duplicate product/source observations before fold assignment', () => {
		for (const shrinkage of [-1, NaN, Infinity]) {
			expect(() => estimatePartitionStatistics(products(1), RANK_GRID, shrinkage)).toThrow(RangeError);
			expect(() => validateSourceOffsets(products(1), RANK_GRID, shrinkage)).toThrow(RangeError);
		}
		const duplicate = [
			{
				id: 'a',
				measurements: [
					{ source: 'same', curve: new Float64Array(120) },
					{ source: 'same', curve: new Float64Array(120) }
				]
			}
		];
		expect(() => estimatePartitionStatistics(duplicate, RANK_GRID)).toThrow(RangeError);
		// A single occupied fold has no training products: training-only validation would miss this.
		expect(() => validateSourceOffsets(duplicate, RANK_GRID, 10, 2)).toThrow(RangeError);
	});
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
	it('uses local finite support so a partly observed three-source product converges to its shared centre', () => {
		// Symmetric plateaus keep all LS offsets exactly zero. Each centre is farther than the
		// smoothing radius from a boundary: smoothing cannot alter the independent 0/6 -> 3 answer.
		const a = new Float64Array(120),
			b = new Float64Array(120),
			c = new Float64Array(120);
		b.fill(6, 20, 40);
		b.fill(-6, 70, 90);
		c.fill(NaN, 20, 40);
		c.fill(NaN, 70, 90);
		const stats = estimatePartitionStatistics(
			[
				{
					id: 'partial',
					measurements: [
						{ source: 'a', curve: a },
						{ source: 'b', curve: b },
						{ source: 'c', curve: c }
					]
				}
			],
			RANK_GRID,
			0
		);
		const offsetA = stats.sourceOffsets.find((s) => s.source === 'a'),
			offsetB = stats.sourceOffsets.find((s) => s.source === 'b'),
			offsetC = stats.sourceOffsets.find((s) => s.source === 'c');
		for (const [i, centre] of [
			[30, 3],
			[80, -3]
		] as const) {
			expect((a[i] ?? NaN) - (offsetA?.curve[i] ?? NaN)).toBeCloseTo(centre, 12);
			expect((b[i] ?? NaN) - (offsetB?.curve[i] ?? NaN)).toBeCloseTo(centre, 12);
			expect(Number.isNaN(offsetC?.curve[i])).toBe(true);
			expect(offsetC?.support[i]).toBe(0);
		}
	});
	it('handles the literal one-missing-bin case with LS alignment and Gaussian smoothing', () => {
		const n = 120,
			index = 60,
			a = new Float64Array(n),
			b = new Float64Array(n),
			c = new Float64Array(n);
		b[index] = 6;
		c[index] = NaN;
		const stats = estimatePartitionStatistics(
			[
				{
					id: 'one-bin',
					measurements: [
						{ source: 'a', curve: a },
						{ source: 'b', curve: b },
						{ source: 'c', curve: c }
					]
				}
			],
			RANK_GRID,
			0
		);
		// B's aligned baseline is -6/n; A's leave-one-out consensus has the following mean.
		const bMean = 6 / n,
			looMean = (3 * (n - 1)) / (n * n);
		const aBaseline = ((bMean / 2 + looMean) * 2) / 3,
			aCentre = (-(6 - bMean) + looMean) / 2;
		const bBaseline = (-bMean * 2) / 3,
			bCentre = (6 - bMean) / 2;
		// Independent Gaussian normalisation: 1/3 oct at 12 bins/oct has equivalent width 4 bins.
		const sigma = 4 / Math.sqrt(2 * Math.PI),
			radius = Math.ceil(3 * sigma);
		let kernelSum = 0;
		for (let j = -radius; j <= radius; j++) kernelSum += Math.exp((-j * j) / (2 * sigma * sigma));
		expect(stats.sourceOffsets.find((s) => s.source === 'a')?.curve[index]).toBeCloseTo(
			aBaseline + (aCentre - aBaseline) / kernelSum,
			12
		);
		expect(stats.sourceOffsets.find((s) => s.source === 'b')?.curve[index]).toBeCloseTo(
			bBaseline + (bCentre - bBaseline) / kernelSum,
			12
		);
		expect(Number.isNaN(stats.sourceOffsets.find((s) => s.source === 'c')?.curve[index])).toBe(true);
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
