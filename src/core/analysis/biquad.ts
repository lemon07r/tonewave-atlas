import { GRID } from '../grid.ts';
import { type Curve } from './common.ts';

export const SAMPLE_RATE = 48000;
const FILTER_TYPES: readonly string[] = ['peak', 'low-shelf', 'high-shelf'];
export interface Filter {
	type: 'peak' | 'low-shelf' | 'high-shelf';
	frequency: number;
	gain: number;
	q: number;
}
export interface Biquad {
	b0: number;
	b1: number;
	b2: number;
	a0: number;
	a1: number;
	a2: number;
}

/** RBJ Audio EQ Cookbook, Q parameterisation (not shelf slope S). */
export function biquadCoefficients(filter: Filter, sampleRate = SAMPLE_RATE): Biquad {
	const { frequency, gain, q, type } = filter;
	if (!FILTER_TYPES.includes(type)) throw new RangeError('Invalid filter type');
	if (!(
		frequency > 0 &&
		frequency < sampleRate / 2 &&
		q > 0 &&
		Number.isFinite(q) &&
		Number.isFinite(sampleRate) &&
		Number.isFinite(gain)
	))
		throw new RangeError('Invalid filter');
	const a = 10 ** (gain / 40),
		w = (2 * Math.PI * frequency) / sampleRate,
		c = Math.cos(w),
		alpha = Math.sin(w) / (2 * q),
		t = 2 * Math.sqrt(a) * alpha;
	if (type === 'peak')
		return {
			b0: 1 + alpha * a,
			b1: -2 * c,
			b2: 1 - alpha * a,
			a0: 1 + alpha / a,
			a1: -2 * c,
			a2: 1 - alpha / a
		};
	if (type === 'low-shelf')
		return {
			b0: a * (a + 1 - (a - 1) * c + t),
			b1: 2 * a * (a - 1 - (a + 1) * c),
			b2: a * (a + 1 - (a - 1) * c - t),
			a0: a + 1 + (a - 1) * c + t,
			a1: -2 * (a - 1 + (a + 1) * c),
			a2: a + 1 + (a - 1) * c - t
		};
	return {
		b0: a * (a + 1 + (a - 1) * c + t),
		b1: -2 * a * (a - 1 + (a + 1) * c),
		b2: a * (a + 1 + (a - 1) * c - t),
		a0: a + 1 - (a - 1) * c + t,
		a1: 2 * (a - 1 - (a + 1) * c),
		a2: a + 1 - (a - 1) * c - t
	};
}

function power(c0: number, c1: number, c2: number, s: number): number {
	return (c0 + c1 + c2) ** 2 - 4 * (c0 * c1 + 4 * c0 * c2 + c1 * c2) * s + 16 * c0 * c2 * s * s;
}

/** Closed-form |H|² polynomial in sin²(w/2); all arithmetic is float64. */
export function biquadMagnitudeDb(coefficients: Biquad, frequency: number, sampleRate = SAMPLE_RATE): number {
	const s = Math.sin((Math.PI * frequency) / sampleRate) ** 2,
		c = coefficients;
	return (
		10 *
		Math.log10(
			Math.max(Number.MIN_VALUE, power(c.b0, c.b1, c.b2, s)) /
				Math.max(Number.MIN_VALUE, power(c.a0, c.a1, c.a2, s))
		)
	);
}

export function filterResponse(
	filter: Filter,
	frequencies: Curve = GRID,
	sampleRate = SAMPLE_RATE
): Float64Array {
	const c = biquadCoefficients(filter, sampleRate);
	return Float64Array.from(frequencies, (f) => biquadMagnitudeDb(c, f, sampleRate));
}

export function equalizerResponse(
	filters: readonly Filter[],
	frequencies: Curve = GRID,
	sampleRate = SAMPLE_RATE
): Float64Array {
	const out = new Float64Array(frequencies.length);
	for (const filter of filters) {
		const c = biquadCoefficients(filter, sampleRate);
		for (let i = 0; i < out.length; i++)
			out[i] = (out[i] ?? 0) + biquadMagnitudeDb(c, frequencies[i] ?? NaN, sampleRate);
	}
	return out;
}
