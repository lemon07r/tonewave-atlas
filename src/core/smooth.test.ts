import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { smoothOctave } from './smooth.ts';

describe('smoothOctave', () => {
	it('leaves a constant curve unchanged', () => {
		const out = smoothOctave(new Float64Array(240).fill(73.2), 6);
		for (const v of out) expect(v).toBeCloseTo(73.2, 12);
	});

	it('preserves a straight line in log-frequency away from the edges', () => {
		// y = 0.5 dB per grid step; a symmetric kernel reproduces any linear function exactly.
		const line = Float64Array.from({ length: 240 }, (_, k) => 0.5 * k);
		const out = smoothOctave(line, 3);
		for (let k = 40; k < 200; k++) expect(out[k]).toBeCloseTo(0.5 * k, 9);
	});

	it('keeps NaN where data is missing and does not leak it into neighbours', () => {
		const v = new Float64Array(240).fill(60);
		for (let k = 200; k < 240; k++) v[k] = NaN;
		const out = smoothOctave(v, 12);
		expect(Number.isNaN(out[220])).toBe(true);
		expect(out[199]).toBeCloseTo(60, 12);
	});

	it('attenuates a one-bin spike by roughly the kernel peak weight', () => {
		const v = new Float64Array(240);
		v[120] = 10;
		const out = smoothOctave(v, 6);
		// Equivalent bandwidth 1/6 oct = 4 bins, so peak ≈ 10 / 4 = 2.5 dB (Gaussian, normalised).
		expect(out[120]).toBeGreaterThan(2.3);
		expect(out[120]).toBeLessThan(2.7);
	});

	it('never moves values outside the input range', () => {
		fc.assert(
			fc.property(
				fc.array(fc.double({ min: -50, max: 50, noNaN: true }), { minLength: 5, maxLength: 80 }),
				(arr) => {
					const out = smoothOctave(arr, 6);
					const lo = Math.min(...arr);
					const hi = Math.max(...arr);
					expect(out.every((x) => x >= lo - 1e-9 && x <= hi + 1e-9)).toBe(true);
				}
			)
		);
	});
});
