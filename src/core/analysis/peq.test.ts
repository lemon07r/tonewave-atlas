import { describe, expect, it } from 'vitest';
import { GRID } from '../grid.ts';
import {
	biquadCoefficients,
	biquadMagnitudeDb,
	equalizerResponse,
	filterResponse,
	type Filter
} from './biquad.ts';
import { fitPeq, exportEqualizerApo, exportPeqJson, exportWavelet, smoothEqError } from './peq.ts';
import { buildTarget } from './targets.ts';

/** Independent objective: demean low-band errors; only the high-band mean has total weight .1. */
function fittingLoss(filters: readonly Filter[], target: Float64Array): number {
	const response = equalizerResponse(filters),
		desired = smoothEqError(target);
	const low = Array.from(GRID, (f, i) =>
		f <= 10000 && Number.isFinite(desired[i]) ? (response[i] ?? 0) - (desired[i] ?? 0) : NaN
	).filter(Number.isFinite);
	const offset = low.reduce((s, e) => s + e, 0) / low.length;
	const high = Array.from(GRID, (f, i) =>
		f > 10000 && Number.isFinite(desired[i]) ? (response[i] ?? 0) - (desired[i] ?? 0) - offset : NaN
	).filter(Number.isFinite);
	const mean = high.length ? high.reduce((s, e) => s + e, 0) / high.length : 0;
	return low.reduce((s, e) => s + (e - offset) ** 2, 0) + 0.1 * mean ** 2;
}

describe('RBJ filters', () => {
	it('agrees with independent complex evaluation of H(exp(jw)) for every type', () => {
		for (const type of ['peak', 'low-shelf', 'high-shelf'] as const)
			for (const gain of [-12, 0, 8]) {
				const c = biquadCoefficients({ type, gain, frequency: 1000, q: 0.707 });
				for (const f of [20, 80, 1000, 6000, 19000]) {
					const w = (2 * Math.PI * f) / 48000;
					const nr = c.b0 + c.b1 * Math.cos(w) + c.b2 * Math.cos(2 * w),
						ni = -c.b1 * Math.sin(w) - c.b2 * Math.sin(2 * w);
					const dr = c.a0 + c.a1 * Math.cos(w) + c.a2 * Math.cos(2 * w),
						di = -c.a1 * Math.sin(w) - c.a2 * Math.sin(2 * w);
					const expected = 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
					expect(biquadMagnitudeDb(c, f)).toBeCloseTo(expected, 6);
				}
			}
	});
	it('satisfies centre-gain, unity, reciprocal-gain and shelf-endpoint identities', () => {
		for (const type of ['peak', 'low-shelf', 'high-shelf'] as const) {
			const f: Filter = { type, frequency: 1000, gain: 6, q: 1 };
			expect(biquadMagnitudeDb(biquadCoefficients(f), 1000)).toBeCloseTo(type === 'peak' ? 6 : 3, 8);
			const forward = filterResponse(f),
				inverse = filterResponse({ ...f, gain: -6 });
			for (let i = 0; i < 240; i++) expect((forward[i] ?? 0) + (inverse[i] ?? 0)).toBeCloseTo(0, 6);
			expect(filterResponse({ ...f, gain: 0 }).every((v) => Math.abs(v) < 1e-9)).toBe(true);
			if (type !== 'peak') {
				expect(biquadMagnitudeDb(biquadCoefficients(f), 0)).toBeCloseTo(type === 'low-shelf' ? 6 : 0, 7);
				expect(biquadMagnitudeDb(biquadCoefficients(f), 24000)).toBeCloseTo(type === 'high-shelf' ? 6 : 0, 7);
			}
		}
	});
});

describe('target builder', () => {
	it('is identity by default and has analytic pivoted tilt', () => {
		const base = Float64Array.from(GRID, (f) => Math.sin(Math.log(f)));
		expect(buildTarget(base)).toEqual(base);
		const tilt = buildTarget(new Float64Array(240), { tiltDbPerOctave: 2 });
		expect(tilt[0]).toBeCloseTo(2 * Math.log2(20 / 1000), 12);
		expect((tilt[120] ?? 0) - (tilt[96] ?? 0)).toBeCloseTo(2, 12);
	});
	it('reuses RBJ shelves, preserves missing coverage, and scales presence relative to base', () => {
		const base = Float64Array.from(GRID, (f) => (f > 1000 && f < 6000 ? 8 : 0));
		base[239] = NaN;
		const shelf = buildTarget(base, { bassShelf: { gain: 4 } }),
			expected = filterResponse({ type: 'low-shelf', gain: 4, frequency: 100, q: 0.707 });
		expect(shelf[0]).toBeCloseTo((base[0] ?? 0) + (expected[0] ?? 0), 10);
		expect(Number.isNaN(shelf[239])).toBe(true);
		const presence = buildTarget(base, { presenceScale: 0.5 });
		expect(presence[165]).toBeLessThan(base[165] ?? 0);
		const partial = new Float64Array(240).fill(NaN);
		partial.fill(3, 0, 40);
		expect(buildTarget(partial)).toEqual(partial);
	});
});

describe('constrained PEQ', () => {
	it('recovers a known isolated synthetic peak', () => {
		const known: Filter = { type: 'peak', frequency: 1000, gain: 5, q: 2 },
			target = filterResponse(known);
		const fit = fitPeq(new Float64Array(240), target, { maxFilters: 1, iterations: 30 });
		expect(fit?.filters).toHaveLength(1);
		expect(fit?.filters[0]?.frequency).toBeCloseTo(1000, -1);
		expect(fit?.filters[0]?.gain).toBeCloseTo(5, 1);
		expect(fit?.filters[0]?.q).toBeCloseTo(2, 1);
		expect(fit?.residualDistanceDb).toBeLessThan(0.03);
	});
	it('recovers a known shelf-plus-peak shape within response tolerance', () => {
		const target = equalizerResponse([
			{ type: 'low-shelf', frequency: 100, gain: 4, q: 0.707 },
			{ type: 'peak', frequency: 2200, gain: -4, q: 1.5 }
		]);
		const fit = fitPeq(new Float64Array(240), target, { maxFilters: 3 });
		expect(fit?.residualDistanceDb).toBeLessThan(0.15);
		expect(fit?.filters.some((f) => f.type === 'low-shelf')).toBe(true);
		expect(fit?.preamp).toBeLessThan(-4);
	});
	it('enforces bounds, rejects narrow-notch filling, and reports safe export headroom', () => {
		const measurement = new Float64Array(240);
		measurement[120] = -15;
		const fit = fitPeq(measurement, new Float64Array(240));
		if (!fit) throw new Error('missing fit');
		expect(fit.hardToCorrect.some((r) => r.reason === 'narrow-notch')).toBe(true);
		expect(fit.response[120]).toBeLessThan(3);
		for (const f of fit.filters) {
			expect(f.q).toBeGreaterThanOrEqual(f.type === 'peak' ? 0.5 : 0.4);
			expect(f.q).toBeLessThanOrEqual(f.type === 'peak' ? 6 : 1);
			expect(f.gain).toBeLessThanOrEqual(f.frequency > 6000 ? 4 : 8);
			expect(f.gain).toBeGreaterThanOrEqual(-12);
		}
		expect(fit.preamp + Math.max(0, ...fit.response)).toBeLessThanOrEqual(-0.199);
		expect(exportEqualizerApo(fit)).toContain('Preamp:');
		expect(exportWavelet(fit)).toMatch(/^GraphicEQ: 20 /);
		expect(exportPeqJson(fit)).toContain('"sampleRate": 48000');
	});
	it('broadens treble smoothing and returns null without sufficient overlap', () => {
		const error = new Float64Array(240);
		error[220] = 12;
		error[120] = 12;
		const smoothed = smoothEqError(error);
		expect(smoothed[220]).toBeLessThan((smoothed[120] ?? 0) / 10);
		expect(fitPeq(new Float64Array(240).fill(NaN), error)).toBeNull();
		const flat = fitPeq(new Float64Array(240).fill(70), new Float64Array(240).fill(90));
		expect(flat?.filters).toEqual([]);
		expect(flat?.residualDistanceDb).toBe(0);
		expect(flat?.preamp).toBe(-0.2);
	});
	it('caps summed high-frequency boost, not merely each filter gain', () => {
		const target = filterResponse({ type: 'high-shelf', frequency: 6000, gain: 12, q: 0.7 });
		const result = fitPeq(new Float64Array(240), target, { maxFilters: 3 });
		if (!result) throw new Error('fixture');
		const high = Float64Array.from({ length: 200 }, (_, i) => 6000 * 4 ** (i / 199));
		expect(Math.max(...equalizerResponse(result.filters, high))).toBeLessThanOrEqual(4.001);
	});
	it('fits a bounded shelf when the target differs only above 10 kHz', () => {
		const target = Float64Array.from(GRID, (f) => (f > 10000 ? 4 : 0));
		const result = fitPeq(new Float64Array(240), target, { maxFilters: 1 });
		if (!result) throw new Error('missing fit');
		expect(result.filters).toHaveLength(1);
		expect(result.filters[0]?.type).toBe('high-shelf');
		expect(result.filters[0]?.gain).toBeLessThanOrEqual(4);
		expect(fittingLoss(result.filters, target)).toBeLessThan(fittingLoss([], target));
	});
	it('seeds the high-band average even when missing transition samples prevent a lower-band seed', () => {
		const target = Float64Array.from(GRID, (f) => (f > 10000 ? 4 : f > 6000 ? NaN : 0));
		const result = fitPeq(new Float64Array(240), target, { maxFilters: 1 });
		if (!result) throw new Error('missing fit');
		expect(result.filters).toHaveLength(1);
		expect(result.filters[0]?.type).toBe('high-shelf');
		expect(result.filters[0]?.gain).toBeGreaterThan(0);
		expect(result.filters[0]?.gain).toBeLessThanOrEqual(4);
		expect(fittingLoss(result.filters, target)).toBeLessThan(fittingLoss([], target));
		const high = Float64Array.from({ length: 257 }, (_, i) => 6000 * 4 ** (i / 256));
		expect(Math.max(...equalizerResponse(result.filters, high))).toBeLessThanOrEqual(4.001);
	});
});
