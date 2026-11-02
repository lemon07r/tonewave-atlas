import { GRID } from '../grid.ts';
import { smoothOctave } from '../smooth.ts';
import {
	biquadCoefficients,
	biquadMagnitudeDb,
	equalizerResponse,
	SAMPLE_RATE,
	type Filter
} from './biquad.ts';
import { BANDS, clamp, regionMean, sameLength, type Curve } from './common.ts';
import { responseDistance } from './distance.ts';

export interface PeqOptions {
	maxFilters?: number;
	iterations?: number;
}
export interface HardRegion {
	low: number;
	high: number;
	reason: 'narrow-notch' | 'residual' | 'high-frequency-uncertainty';
}
export interface PeqResult {
	filters: Filter[];
	preamp: number;
	response: Float64Array;
	residual: Float64Array;
	residualDistanceDb: number;
	hardToCorrect: HardRegion[];
}

/** AutoEq-inspired bandwidth: 1/12 octave below 6k, linear blend to 2 octaves at 8k. */
export function smoothEqError(error: Curve): Float64Array {
	sameLength(error, GRID);
	const fine = smoothOctave(error, 12),
		coarse = smoothOctave(error, 0.5);
	return Float64Array.from(error, (_, i) => {
		const blend = clamp(((GRID[i] ?? 0) - 6000) / 2000, 0, 1);
		return (fine[i] ?? NaN) * (1 - blend) + (coarse[i] ?? NaN) * blend;
	});
}

function project(filter: Filter): Filter {
	const frequency = clamp(filter.frequency, 20, 10000);
	return {
		...filter,
		frequency,
		gain: clamp(filter.gain, -12, frequency > 6000 || filter.type === 'high-shelf' ? 4 : 8),
		q: clamp(filter.q, filter.type === 'peak' ? 0.5 : 0.4, filter.type === 'peak' ? 6 : 1)
	};
}

function parameters(filters: readonly Filter[]): number[] {
	return filters.flatMap((f) => [Math.log2(f.frequency), f.gain, Math.log2(f.q)]);
}
function fromParameters(values: readonly number[], templates: readonly Filter[]): Filter[] {
	return templates.map((f, i) =>
		project({
			...f,
			frequency: 2 ** (values[3 * i] ?? 0),
			gain: values[3 * i + 1] ?? 0,
			q: 2 ** (values[3 * i + 2] ?? 0)
		})
	);
}

/** Pivoted Gaussian elimination of the tiny LM system (at most 30 × 30). */
function solve(matrix: number[][], vector: number[]): number[] | null {
	const n = vector.length;
	for (let k = 0; k < n; k++) {
		let pivot = k;
		for (let i = k + 1; i < n; i++)
			if (Math.abs(matrix[i]?.[k] ?? 0) > Math.abs(matrix[pivot]?.[k] ?? 0)) pivot = i;
		[matrix[k], matrix[pivot]] = [matrix[pivot] ?? [], matrix[k] ?? []];
		[vector[k], vector[pivot]] = [vector[pivot] ?? 0, vector[k] ?? 0];
		const row = matrix[k],
			diagonal = row?.[k] ?? 0;
		if (!row || Math.abs(diagonal) < 1e-14) return null;
		for (let i = k + 1; i < n; i++) {
			const other = matrix[i];
			if (!other) continue;
			const factor = (other[k] ?? 0) / diagonal;
			for (let j = k; j < n; j++) other[j] = (other[j] ?? 0) - factor * (row[j] ?? 0);
			vector[i] = (vector[i] ?? 0) - factor * (vector[k] ?? 0);
		}
	}
	const out = new Array<number>(n).fill(0);
	for (let i = n - 1; i >= 0; i--) {
		let rhs = vector[i] ?? 0;
		for (let j = i + 1; j < n; j++) rhs -= (matrix[i]?.[j] ?? 0) * (out[j] ?? 0);
		out[i] = rhs / (matrix[i]?.[i] ?? 1);
	}
	return out;
}

function residuals(filters: readonly Filter[], desired: Curve): Float64Array {
	const response = equalizerResponse(filters);
	let sum = 0,
		n = 0;
	for (let i = 0; i < GRID.length; i++)
		if ((GRID[i] ?? Infinity) <= 10000 && Number.isFinite(desired[i])) {
			sum += (response[i] ?? 0) - (desired[i] ?? 0);
			n++;
		}
	const offset = n ? sum / n : 0;
	const out = Float64Array.from(desired, (d, i) =>
		Number.isFinite(d) ? (response[i] ?? 0) - d - offset : 0
	);
	// Above 10 kHz only the band mean is fitted, not fine-grained resonances.
	let high = 0,
		hn = 0;
	for (let i = 0; i < GRID.length; i++)
		if ((GRID[i] ?? 0) > 10000 && Number.isFinite(desired[i])) {
			high += out[i] ?? 0;
			hn++;
		}
	for (let i = 0; i < GRID.length; i++)
		if ((GRID[i] ?? 0) > 10000)
			out[i] = hn && Number.isFinite(desired[i]) ? (high / hn) * Math.sqrt(0.1 / hn) : 0;
	return out;
}
function loss(residual: Curve): number {
	let sum = 0;
	for (let i = 0; i < residual.length; i++) sum += (residual[i] ?? 0) ** 2;
	return sum;
}

function capTrebleBoost(filters: Filter[]): Filter[] {
	const highGrid = Float64Array.from({ length: 513 }, (_, i) => 6000 * 4 ** (i / 512));
	for (let iteration = 0; iteration < 12; iteration++) {
		const max = Math.max(...equalizerResponse(filters, highGrid));
		if (max <= 4) break;
		filters = filters.map((f) => (f.gain > 0 ? { ...f, gain: (f.gain * 3.99) / max } : f));
	}
	return filters;
}

function refine(initial: readonly Filter[], desired: Curve, iterations: number): Filter[] {
	let filters = [...initial],
		r = residuals(filters, desired),
		cost = loss(r),
		lambda = 0.05;
	for (let iteration = 0; iteration < iterations; iteration++) {
		const p = parameters(filters),
			n = p.length;
		const jacobian = p.map((value, j) => {
			const trial = [...p],
				step = j % 3 === 1 ? 0.02 : 0.005;
			trial[j] = value + step;
			const rr = residuals(fromParameters(trial, filters), desired);
			return Float64Array.from(rr, (v, i) => (v - (r[i] ?? 0)) / step);
		});
		const matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0)),
			vector = new Array<number>(n).fill(0);
		for (let j = 0; j < n; j++) {
			const col = jacobian[j];
			if (!col) continue;
			for (let i = 0; i < r.length; i++) vector[j] = (vector[j] ?? 0) - (col[i] ?? 0) * (r[i] ?? 0);
			for (let k = 0; k <= j; k++) {
				let sum = 0;
				for (let i = 0; i < r.length; i++) sum += (col[i] ?? 0) * (jacobian[k]?.[i] ?? 0);
				const row = matrix[j],
					other = matrix[k];
				if (row) row[k] = sum;
				if (other) other[j] = sum;
			}
			const row = matrix[j];
			if (row) row[j] = (row[j] ?? 0) + lambda * Math.max(1, row[j] ?? 0);
		}
		const delta = solve(matrix, vector);
		if (!delta) break;
		const trial = fromParameters(
			p.map((v, j) => v + clamp(delta[j] ?? 0, j % 3 === 1 ? -3 : -0.5, j % 3 === 1 ? 3 : 0.5)),
			filters
		);
		const rr = residuals(trial, desired),
			next = loss(rr);
		if (next < cost) {
			const improvement = cost - next;
			filters = trial;
			r = rr;
			cost = next;
			lambda = Math.max(1e-6, lambda / 3);
			if (improvement < 1e-7) break;
		} else lambda *= 5;
	}
	return filters;
}

export function fitPeq(measurement: Curve, target: Curve, options: PeqOptions = {}): PeqResult | null {
	sameLength(measurement, GRID);
	sameLength(target, GRID);
	const distance = responseDistance(measurement, target, { maxHz: 10000 });
	if (!distance) return null;
	const maxFilters = options.maxFilters ?? 5,
		iterations = options.iterations ?? 18;
	if (
		!Number.isInteger(maxFilters) ||
		maxFilters < 0 ||
		maxFilters > 10 ||
		!Number.isInteger(iterations) ||
		iterations < 1 ||
		iterations > 100
	)
		throw new RangeError('Invalid fitter limits');
	const raw = Float64Array.from(measurement, (v, i) => (target[i] ?? NaN) - v + distance.offset);
	const safeRaw = raw.slice(),
		broad = smoothOctave(raw, 3),
		blocked = new Uint8Array(GRID.length);
	const hardToCorrect: HardRegion[] = [{ low: 10000, high: 20000, reason: 'high-frequency-uncertainty' }];
	for (let i = 0; i < raw.length; i++)
		if ((raw[i] ?? 0) - (broad[i] ?? 0) > 2 && (raw[i] ?? 0) > 0) {
			blocked[i] = 1;
			hardToCorrect.push({
				low: GRID[Math.max(0, i - 1)] ?? 20,
				high: GRID[Math.min(GRID.length - 1, i + 1)] ?? 20000,
				reason: 'narrow-notch'
			});
		}
	// Remove notch requests BEFORE smoothing; otherwise their smoothed shoulders still invite boosts.
	for (let i = 0; i < raw.length; i++) {
		if (!blocked[i]) continue;
		const start = i;
		while (i + 1 < raw.length && blocked[i + 1]) i++;
		const end = i,
			left = raw[start - 1] ?? NaN,
			right = raw[end + 1] ?? NaN;
		for (let j = start; j <= end; j++)
			safeRaw[j] =
				Number.isFinite(left) && Number.isFinite(right)
					? left + ((right - left) * (j - start + 1)) / (end - start + 2)
					: 0;
	}
	const desired = smoothEqError(safeRaw);
	let filters: Filter[] = [],
		cost = loss(residuals(filters, desired));
	for (let count = 0; count < maxFilters; count++) {
		const r = residuals(filters, desired);
		let index = -1,
			largest = 0;
		for (let i = 0; i < r.length; i++)
			if (
				(GRID[i] ?? Infinity) <= 10000 &&
				!blocked[i] &&
				Math.abs(r[i] ?? 0) > largest &&
				Number.isFinite(desired[i])
			) {
				index = i;
				largest = Math.abs(r[i] ?? 0);
			}
		let highSum = 0,
			highCount = 0;
		for (let i = 0; i < r.length; i++)
			if ((GRID[i] ?? 0) > 10000 && Number.isFinite(desired[i])) {
				highSum += r[i] ?? 0;
				highCount++;
			}
		// Undo residuals' distributed high-band weight to recover the mean error in dB.
		const highMean = highCount ? (highSum / highCount) * Math.sqrt(highCount / 0.1) : 0;
		if ((index < 0 || largest < 0.15) && Math.abs(highMean) < 0.15) break;
		const seeds: Filter[] = [];
		if (index >= 0 && largest >= 0.15) {
			const gain = -(r[index] ?? 0),
				frequency = GRID[index] ?? 1000;
			seeds.push(
				...[0.7, 1.5, 3].map((q) => project({ type: 'peak', frequency, gain, q })),
				project({ type: 'low-shelf', frequency: 100, gain: -regionMean(r, GRID, 20, 100), q: 0.707 }),
				project({ type: 'high-shelf', frequency: 6000, gain: -regionMean(r, GRID, 6000, 10000), q: 0.707 })
			);
		}
		if (Math.abs(highMean) >= 0.15)
			seeds.push(project({ type: 'high-shelf', frequency: 10000, gain: -highMean, q: 0.707 }));
		let best: Filter[] | null = null,
			bestCost = cost;
		for (const seed of seeds) {
			if (!Number.isFinite(seed.gain)) continue;
			const trial = capTrebleBoost(refine([...filters, seed], desired, Math.min(8, iterations))),
				trialCost = loss(residuals(trial, desired));
			if (trialCost < bestCost) {
				bestCost = trialCost;
				best = trial;
			}
		}
		if (!best || cost - bestCost < 0.005) break;
		const refined = capTrebleBoost(refine(best, desired, iterations)),
			refinedCost = loss(residuals(refined, desired));
		// Refined projection may trade off fit: retain the improving, already bounded seed trial.
		filters = refinedCost < bestCost ? refined : best;
		cost = Math.min(refinedCost, bestCost);
	}
	filters = capTrebleBoost(filters.filter((f) => Math.abs(f.gain) >= 0.05));
	const response = equalizerResponse(filters),
		corrected = Float64Array.from(measurement, (v, i) => v + (response[i] ?? 0));
	const final = responseDistance(corrected, target, { maxHz: 10000 });
	if (!final) return null;
	const residual = Float64Array.from(corrected, (v, i) => v - (target[i] ?? NaN) - final.offset);
	for (const b of BANDS)
		if (b.low < 10000 && (final.bands.find((band) => band.band === b.id)?.rmsDb ?? 0) > 3)
			hardToCorrect.push({ low: b.low, high: b.high, reason: 'residual' });
	// Dense sweep catches inter-grid maxima, not just the 240 displayed samples.
	const coefficients = filters.map((f) => biquadCoefficients(f));
	let maxBoost = 0;
	for (let i = 0; i <= 4096; i++) {
		const hz = 20 * (SAMPLE_RATE / 2 / 20) ** (i / 4096);
		let boost = 0;
		for (const c of coefficients) boost += biquadMagnitudeDb(c, hz);
		maxBoost = Math.max(maxBoost, boost);
	}
	return {
		filters,
		preamp: -maxBoost - 0.2,
		response,
		residual,
		residualDistanceDb: final.distance,
		hardToCorrect
	};
}

export function exportEqualizerApo(result: PeqResult): string {
	return [
		`Preamp: ${result.preamp.toFixed(2)} dB`,
		...result.filters.map(
			(f, i) =>
				`Filter ${i + 1}: ON ${f.type === 'peak' ? 'PK' : f.type === 'low-shelf' ? 'LSC' : 'HSC'} Fc ${f.frequency.toFixed(2)} Hz Gain ${f.gain.toFixed(2)} dB Q ${f.q.toFixed(4)}`
		)
	].join('\n');
}
export function exportWavelet(result: PeqResult): string {
	const frequencies = Float64Array.from({ length: 127 }, (_, i) => 20 * 1000 ** (i / 126));
	const response = equalizerResponse(result.filters, frequencies);
	return `GraphicEQ: ${Array.from(frequencies, (f, i) => `${Math.round(f)} ${((response[i] ?? 0) + result.preamp).toFixed(2)}`).join('; ')}`;
}
export function exportPeqJson(result: PeqResult): string {
	return JSON.stringify({ sampleRate: SAMPLE_RATE, preamp: result.preamp, filters: result.filters }, null, 2);
}
