import { describe, expect, it } from 'vitest';
import { GRID } from '../grid.ts';
import type { Filter } from './biquad.ts';
import { exportEqualizerApo, exportWavelet, fitPeq, type PeqResult } from './peq.ts';

/** Independent RBJ cookbook coefficients and complex H(z), never calling biquad.ts.
 * https://www.w3.org/TR/audio-eq-cookbook/ (alpha from Q, not shelf slope S).
 */
function cookbook(filter: Filter, hz: number): number {
	const A = Math.pow(10, filter.gain / 40),
		w0 = (2 * Math.PI * filter.frequency) / 48000;
	const cos = Math.cos(w0),
		alpha = Math.sin(w0) / (2 * filter.q),
		beta = 2 * Math.sqrt(A) * alpha;
	let b: number[], a: number[];
	if (filter.type === 'peak') {
		b = [1 + alpha * A, -2 * cos, 1 - alpha * A];
		a = [1 + alpha / A, -2 * cos, 1 - alpha / A];
	} else if (filter.type === 'low-shelf') {
		b = [
			A * (A + 1 - (A - 1) * cos + beta),
			2 * A * (A - 1 - (A + 1) * cos),
			A * (A + 1 - (A - 1) * cos - beta)
		];
		a = [A + 1 + (A - 1) * cos + beta, -2 * (A - 1 + (A + 1) * cos), A + 1 + (A - 1) * cos - beta];
	} else {
		b = [
			A * (A + 1 + (A - 1) * cos + beta),
			-2 * A * (A - 1 + (A + 1) * cos),
			A * (A + 1 + (A - 1) * cos - beta)
		];
		a = [A + 1 - (A - 1) * cos + beta, 2 * (A - 1 - (A + 1) * cos), A + 1 - (A - 1) * cos - beta];
	}
	const w = (2 * Math.PI * hz) / 48000;
	const power = (coefficients: number[]) => {
		let real = 0,
			imaginary = 0;
		coefficients.forEach((c, k) => {
			real += c * Math.cos(k * w);
			imaginary -= c * Math.sin(k * w);
		});
		return real * real + imaginary * imaginary;
	};
	return 10 * Math.log10(power(b) / power(a));
}
function response(filters: readonly Filter[], hz: number): number {
	return filters.reduce((sum, filter) => sum + cookbook(filter, hz), 0);
}
function parseApo(text: string): { preamp: number; filters: Filter[] } {
	const lines = text.split('\n');
	expect(lines.shift()).toBe('Channel: all');
	const preampLine = /^Preamp: (-?\d+\.\d{2}) dB$/.exec(lines.shift() ?? '');
	if (!preampLine) throw new Error('invalid APO preamp');
	const filters = lines.map((line, index): Filter => {
		const match =
			/^Filter (\d+): ON (PK|LSC|HSC) Fc (\d+\.\d{2}) Hz Gain (-?\d+\.\d{2}) dB Q (\d+\.\d{4})$/.exec(line);
		if (!match) throw new Error(`invalid APO filter: ${line}`);
		expect(Number(match[1])).toBe(index + 1);
		return {
			type: match[2] === 'PK' ? 'peak' : match[2] === 'LSC' ? 'low-shelf' : 'high-shelf',
			frequency: Number(match[3]),
			gain: Number(match[4]),
			q: Number(match[5])
		};
	});
	return { preamp: Number(preampLine[1]), filters };
}

// Literal published AutoEq/Wavelet grid, independently transcribed from the pinned source recipe.
const PUBLISHED = [
	20, 21, 22, 23, 24, 26, 27, 29, 30, 32, 34, 36, 38, 40, 43, 45, 48, 50, 53, 56, 59, 63, 66, 70, 74, 78, 83,
	87, 92, 97, 103, 109, 115, 121, 128, 136, 143, 151, 160, 169, 178, 188, 199, 210, 222, 235, 248, 262, 277,
	292, 309, 326, 345, 364, 385, 406, 429, 453, 479, 506, 534, 565, 596, 630, 665, 703, 743, 784, 829, 875,
	924, 977, 1032, 1090, 1151, 1216, 1284, 1357, 1433, 1514, 1599, 1689, 1784, 1885, 1991, 2103, 2221, 2347,
	2479, 2618, 2766, 2921, 3086, 3260, 3443, 3637, 3842, 4058, 4287, 4528, 4783, 5052, 5337, 5637, 5955, 6290,
	6644, 7018, 7414, 7831, 8272, 8738, 9230, 9749, 10298, 10878, 11490, 12137, 12821, 13543, 14305, 15110,
	15961, 16860, 17809, 18812, 19871
];

describe('EQ export interoperability', () => {
	it('emits every published Wavelet frequency in order and parses back direct gains including preamp once', () => {
		const filters: Filter[] = [
			{ type: 'peak', frequency: 1200, gain: 3.1234, q: 1.17 },
			{ type: 'high-shelf', frequency: 6000, gain: -4.2, q: 0.63 }
		];
		const result: PeqResult = {
			filters,
			preamp: -5,
			response: new Float64Array(),
			residual: new Float64Array(),
			residualDistanceDb: 0,
			hardToCorrect: []
		};
		const text = exportWavelet(result);
		expect(text.startsWith('GraphicEQ: ')).toBe(true);
		const points = text
			.slice('GraphicEQ: '.length)
			.split('; ')
			.map((point) => {
				expect(point).toMatch(/^\d+ -?\d+\.\d{2}$/);
				return point.split(' ').map(Number);
			});
		expect(points.map((p) => p[0])).toEqual(PUBLISHED);
		expect(points).toHaveLength(127);
		for (const [hz = NaN, gain = NaN] of points) {
			expect(Number.isFinite(gain)).toBe(true);
			expect(Math.abs(gain - (response(filters, hz) + result.preamp))).toBeLessThanOrEqual(0.005001);
			expect(gain).toBeLessThanOrEqual(0);
		}
	});
	it.each(['peak', 'low-shelf', 'high-shelf'] as const)(
		'round-trips APO %s Q semantics against independently computed RBJ coefficients',
		(type) => {
			const filter: Filter = {
				type,
				frequency: 1234.567,
				gain: 3.4567,
				q: type === 'peak' ? 2.34567 : 0.54321
			};
			const result: PeqResult = {
				filters: [filter],
				preamp: -8,
				response: new Float64Array(),
				residual: new Float64Array(),
				residualDistanceDb: 0,
				hardToCorrect: []
			};
			const parsed = parseApo(exportEqualizerApo(result));
			expect(parsed.filters[0]).toEqual({
				type,
				frequency: 1234.57,
				gain: 3.46,
				q: type === 'peak' ? 2.3457 : 0.5432
			});
			for (const hz of [20, 100, 1234.57, 5000, 19000, 24000])
				expect(Math.abs(response(parsed.filters, hz) - response([filter], hz))).toBeLessThan(0.006);
			expect(cookbook(parsed.filters[0] ?? filter, 1234.57)).toBeCloseTo(type === 'peak' ? 3.46 : 1.73, 8);
		}
	);
	it.each(['typical', 'huge-boost', 'missing', 'flat'] as const)(
		'retains independently verified headroom, residuals and treble limits for %s curves',
		(kind) => {
			const known: Filter[] = [
				{ type: 'low-shelf', frequency: 100, gain: kind === 'huge-boost' ? 80 : 4, q: 0.707 },
				{ type: 'peak', frequency: 2200, gain: -4, q: 1.5 },
				{ type: 'high-shelf', frequency: 6500, gain: kind === 'huge-boost' ? 80 : 2, q: 0.7 }
			];
			const measurement = Float64Array.from(GRID, (_, i) =>
				kind === 'missing' && i >= 80 && i < 95 ? NaN : 70
			);
			const target = Float64Array.from(GRID, (hz) => 90 + (kind === 'flat' ? 0 : response(known, hz)));
			const result = fitPeq(measurement, target);
			if (!result) throw new Error('missing fit');
			const parsed = parseApo(exportEqualizerApo(result));
			let max = -Infinity;
			for (let i = 0; i <= 4096; i++) max = Math.max(max, response(parsed.filters, 20 * 1200 ** (i / 4096)));
			expect(parsed.preamp + Math.max(0, max)).toBeLessThanOrEqual(-0.199999);
			for (let i = 0; i <= 512; i++) {
				expect(response(result.filters, 6000 * 4 ** (i / 512))).toBeLessThanOrEqual(4.000001);
				expect(response(parsed.filters, 6000 * 4 ** (i / 512))).toBeLessThanOrEqual(4.02);
			}
			const errors = Array.from(GRID, (hz, i) =>
				hz <= 10000 ? (measurement[i] ?? NaN) + response(result.filters, hz) - (target[i] ?? NaN) : NaN
			).filter(Number.isFinite);
			const mean = errors.reduce((s, e) => s + e, 0) / errors.length;
			const distance = Math.sqrt(errors.reduce((s, e) => s + (e - mean) ** 2, 0) / errors.length);
			expect(result.residualDistanceDb).toBeCloseTo(distance, 7);
			for (let i = 0; i < GRID.length; i++) {
				const hz = GRID[i] ?? 20;
				expect(result.response[i]).toBeCloseTo(response(result.filters, hz), 6);
				if (!Number.isFinite(measurement[i])) expect(result.residual[i]).toBeNaN();
			}
			expect(result.hardToCorrect.some((r) => r.reason === 'high-frequency-uncertainty')).toBe(true);
			if (kind === 'flat') expect(parsed).toEqual({ preamp: -0.2, filters: [] });
		}
	);
});
