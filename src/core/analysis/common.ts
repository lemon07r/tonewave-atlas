import { GRID, RANK_GRID } from '../grid.ts';

export type Curve = ArrayLike<number>;
export const BANDS = [
	{ id: 'sub-bass', low: 20, high: 60 },
	{ id: 'bass', low: 60, high: 250 },
	{ id: 'low-mid', low: 250, high: 800 },
	{ id: 'mid', low: 800, high: 2500 },
	{ id: 'presence', low: 2500, high: 5000 },
	{ id: 'treble', low: 5000, high: 10000 },
	{ id: 'air', low: 10000, high: 20000 }
] as const;
export type Band = (typeof BANDS)[number]['id'];

export function frequenciesFor(curve: Curve, frequencies?: Curve): Curve {
	const grid = frequencies ?? (curve.length === RANK_GRID.length ? RANK_GRID : GRID);
	if (curve.length !== grid.length) throw new RangeError('Curve/grid length mismatch');
	return grid;
}

export function sameLength(a: Curve, b: Curve): void {
	if (a.length !== b.length) throw new RangeError('Curve length mismatch');
}

export function median(values: readonly number[]): number {
	const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
	if (!sorted.length) return NaN;
	const i = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? (sorted[i] ?? NaN) : ((sorted[i - 1] ?? NaN) + (sorted[i] ?? NaN)) / 2;
}

export function weightedMedian(values: readonly { value: number; weight: number }[]): number {
	const sorted = values
		.filter((v) => Number.isFinite(v.value) && v.weight > 0)
		.sort((a, b) => a.value - b.value);
	const half = sorted.reduce((sum, v) => sum + v.weight, 0) / 2;
	let sum = 0;
	for (let i = 0; i < sorted.length; i++) {
		const v = sorted[i];
		if (!v) continue;
		sum += v.weight;
		if (sum > half) return v.value;
		if (sum === half) return (v.value + (sorted[i + 1]?.value ?? v.value)) / 2;
	}
	return NaN;
}

export function regionMean(curve: Curve, frequencies: Curve, low: number, high: number): number {
	let sum = 0;
	let n = 0;
	for (let i = 0; i < curve.length; i++) {
		const f = frequencies[i] ?? NaN;
		const v = curve[i] ?? NaN;
		if (f >= low && f < high && Number.isFinite(v)) {
			sum += v;
			n++;
		}
	}
	return n ? sum / n : NaN;
}

export function bandIndex(f: number): number {
	return BANDS.findIndex((b) => f >= b.low && f < b.high);
}

export function clamp(x: number, low: number, high: number): number {
	return Math.max(low, Math.min(high, x));
}
