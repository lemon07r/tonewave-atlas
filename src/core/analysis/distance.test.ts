import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GRID, RANK_GRID, RANK_SIZE } from '../grid.ts';
import { responseDistance, rankPacked } from './distance.ts';
import { makeWeights } from './weights.ts';
import { detectNarrowPeaks } from './peaks.ts';
import { compareReferences } from './multi-reference.ts';

describe('response distance', () => {
	it('matches a hand-computed weighted case including slope and energy shares', () => {
		// e=[0,2,4], w=[1,2,1]: mean=2, variance=2, log f steps=1 -> slope=2.
		const d = responseDistance([0, 2, 4], [0, 0, 0], {
			frequencies: [20, 40, 80],
			weights: [1, 2, 1],
			minPoints: 2
		});
		expect(d?.offset).toBe(2);
		expect(d?.distance).toBeCloseTo(Math.SQRT2, 12);
		expect(d?.tilt).toBeCloseTo(2, 12);
		expect(d?.bands[0]?.meanDb).toBeCloseTo(-2 / 3, 12);
		expect(d?.bands[0]?.rmsDb).toBeCloseTo(Math.sqrt(4 / 3), 12);
		expect(d?.bands[0]?.contribution).toBe(0.5);
		expect(d?.bands[1]?.contribution).toBe(0.5);
	});
	it('is symmetric and level invariant on finite and missing data', () => {
		fc.assert(
			fc.property(
				fc.array(fc.double({ min: -30, max: 30, noNaN: true }), { minLength: 120, maxLength: 120 }),
				fc.double({ min: -100, max: 100, noNaN: true }),
				(a, offset) => {
					const b = Float64Array.from(a, (v, i) => (i % 9 === 0 ? NaN : Math.sin(i) * 3 - v));
					const forward = responseDistance(a, b),
						reverse = responseDistance(b, a),
						shift = responseDistance(
							a.map((v) => v + offset),
							b
						);
					expect(forward?.distance).toBeCloseTo(reverse?.distance ?? -1, 9);
					expect(shift?.distance).toBeCloseTo(forward?.distance ?? -1, 9);
					expect(forward?.offset).toBeCloseTo(-(reverse?.offset ?? NaN), 9);
				}
			),
			{ numRuns: 50 }
		);
	});
	it('rejects insufficient overlap and counts coverage over eligible bins', () => {
		const a = new Float64Array(120).fill(NaN);
		a.fill(3, 0, 60);
		expect(responseDistance(a, new Float64Array(120))?.coverage).toBe(0.5);
		a[0] = NaN;
		expect(responseDistance(a, new Float64Array(120))).toBeNull();
		expect(() => responseDistance([1], [1, 2])).toThrow(RangeError);
	});
	it('only the opt-in treble penalty is directional and is monotone in alpha', () => {
		const a = Float64Array.from(RANK_GRID, (f) => (f >= 2000 && f <= 10000 ? 4 : 0)),
			b = new Float64Array(120);
		const plain = responseDistance(a, b),
			penalised = responseDistance(a, b, { treblePenalty: 2 }),
			reverse = responseDistance(b, a, { treblePenalty: 2 });
		expect(penalised?.distance).toBeGreaterThan(plain?.distance ?? Infinity);
		expect(reverse?.distance).toBeCloseTo(plain?.distance ?? NaN, 12);
		expect(penalised?.bands.reduce((s, b) => s + b.contribution, 0)).toBeCloseTo(1, 12);
	});
	it('packed top-K equals exhaustive ranking and reports missing rows', () => {
		const reference = Float64Array.from(RANK_GRID, (f) => Math.log2(f));
		const matrix = new Float32Array(37 * RANK_SIZE);
		for (let row = 0; row < 37; row++)
			for (let i = 0; i < 120; i++)
				matrix[row * 120 + i] =
					row === 4 ? NaN : (reference[i] ?? 0) + Math.sin(i / 13) * (36 - row) * 0.1 + row;
		const ranked = rankPacked(matrix, reference, 7, { weights: makeWeights(RANK_GRID) });
		const expected = Array.from({ length: 37 }, (_, index) => ({
			index,
			d:
				responseDistance(matrix.subarray(index * 120, (index + 1) * 120), reference, {
					weights: makeWeights(RANK_GRID)
				})?.distance ?? Infinity
		}))
			.sort((a, b) => a.d - b.d)
			.slice(0, 7);
		expect(ranked.matches.map((m) => m.index)).toEqual(expected.map((m) => m.index));
		expect(ranked.insufficient).toBe(1);
		expect(rankPacked(matrix, reference, 0).matches).toEqual([]);
	});
	it('does not change under uniform weight scaling and recovers an analytic tilt', () => {
		const a = Float64Array.from(RANK_GRID, (f) => 7 + 1.25 * Math.log2(f / 1000)),
			b = new Float64Array(120);
		const plain = responseDistance(a, b),
			scaled = responseDistance(a, b, { weights: new Float64Array(120).fill(1000) });
		expect(plain?.tilt).toBeCloseTo(1.25, 10);
		expect(scaled?.distance).toBeCloseTo(plain?.distance ?? NaN, 10);
		// 120 equally weighted consecutive positions 1/12 octave apart have variance (120²−1)/(12·12²).
		expect(plain?.distance).toBeCloseTo(1.25 * Math.sqrt((120 ** 2 - 1) / (12 * 12 ** 2)), 10);
	});
});

describe('weighting and peak diagnostics', () => {
	it('uses inverse variance, finite floor, and exact focus taper anchors', () => {
		const w = makeWeights([100, 1000], { spread: [0, Math.sqrt(3)] });
		expect((w[0] ?? 0) / (w[1] ?? 1)).toBeCloseTo(4, 12);
		expect(((w[0] ?? 0) + (w[1] ?? 0)) / 2).toBeCloseTo(1, 12);
		const taper = makeWeights([8000, 12000, 16000], { spread: [1, 1, 1] });
		expect(Array.from(taper)).toEqual([1, 0.25, 0.1]);
		expect(makeWeights([100], { spread: [NaN] })[0]).toBeGreaterThan(0);
	});
	it('focus presets and custom multipliers emphasise only their stated bands', () => {
		const f = [100, 1000, 7000],
			spread = [1, 1, 1];
		expect(Array.from(makeWeights(f, { spread, focus: 'bass' }))).toEqual([3, 1, 1]);
		expect(Array.from(makeWeights(f, { spread, focus: 'vocals' }))).toEqual([1, 3, 1]);
		expect(Array.from(makeWeights(f, { spread, focus: 'treble', bandMultipliers: { treble: 2 } }))).toEqual([
			1, 1, 6
		]);
	});
	it('separates a narrow peak from broad level and flags >8k', () => {
		const error = new Float64Array(240).fill(5);
		error[214] = 13;
		const result = detectNarrowPeaks(error);
		expect(result.peaks).toHaveLength(1);
		expect(result.peaks[0]?.frequency).toBe(GRID[214]);
		expect(result.peaks[0]?.heightDb).toBeGreaterThan(6);
		expect(result.peaks[0]?.q).toBeGreaterThan(10);
		expect(result.peaks[0]?.lowReliability).toBe(true);
		expect(detectNarrowPeaks(new Float64Array(240).fill(5)).peaks).toEqual([]);
	});
});

it('marks Pareto trade-offs and identical non-dominated candidates', () => {
	const shape = Float64Array.from(RANK_GRID, (_, i) => (i < 60 ? -1 : 1));
	const scaled = (n: number) => Float64Array.from(shape, (v) => v * n);
	const results = compareReferences(
		[scaled(0), scaled(1), scaled(2), scaled(1), scaled(5)],
		[scaled(0), scaled(2)]
	);
	expect(results.map((r) => r.pareto)).toEqual([true, true, true, true, false]);
	expect(results[1]?.minimax).toBeCloseTo(1, 12);
	expect(results[1]?.mean).toBeCloseTo(1, 12);
});
