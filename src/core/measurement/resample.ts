import { GRID } from '../grid.ts';
import type { MeasurementPoints } from './parse.ts';

/** Linear in log Hz, in the dB domain; never extrapolates. Input is validated/sorted by the parser. */
export function resample(points: MeasurementPoints, grid: ArrayLike<number> = GRID): Float64Array {
	const out = new Float64Array(grid.length).fill(NaN);
	for (let i = 0; i < grid.length; i++) {
		const f = grid[i] ?? NaN;
		if (f < (points.hz[0] ?? Infinity) || f > (points.hz.at(-1) ?? -Infinity)) continue;
		let lo = 0;
		let hi = points.hz.length - 1;
		while (lo < hi) {
			const mid = Math.floor((lo + hi) / 2);
			if ((points.hz[mid] ?? Infinity) < f) lo = mid + 1;
			else hi = mid;
		}
		const f1 = points.hz[lo] ?? NaN;
		const y1 = points.db[lo] ?? NaN;
		if (f === f1) out[i] = y1;
		else if (lo > 0) {
			const f0 = points.hz[lo - 1] ?? NaN;
			const y0 = points.db[lo - 1] ?? NaN;
			out[i] = y0 + (Math.log(f / f0) / Math.log(f1 / f0)) * (y1 - y0);
		}
	}
	return out;
}

export interface ChannelAverage {
	values: Float64Array;
	/** Per-bin bitmask: 0 missing, 1 left only, 2 right only, 3 both. */
	contributions: Uint8Array;
	/** RMS(L−R) over finite paired samples on the log grid, 100 Hz–10 kHz; null without overlap. */
	imbalanceDb: number | null;
	pairedBins: number;
}

export function averageChannels(
	left: ArrayLike<number> | null,
	right: ArrayLike<number> | null,
	grid: ArrayLike<number> = GRID
): ChannelAverage {
	const values = new Float64Array(grid.length).fill(NaN);
	const contributions = new Uint8Array(grid.length);
	let squared = 0;
	let pairedBins = 0;
	for (let i = 0; i < grid.length; i++) {
		const l = left?.[i] ?? NaN;
		const r = right?.[i] ?? NaN;
		const hasL = Number.isFinite(l);
		const hasR = Number.isFinite(r);
		contributions[i] = Number(hasL) + 2 * Number(hasR);
		values[i] = hasL && hasR ? (l + r) / 2 : hasL ? l : hasR ? r : NaN;
		const hz = grid[i] ?? 0;
		if (hasL && hasR && hz >= 100 && hz <= 10000) {
			squared += (l - r) ** 2;
			pairedBins++;
		}
	}
	return {
		values,
		contributions,
		imbalanceDb: pairedBins ? Math.sqrt(squared / pairedBins) : null,
		pairedBins
	};
}
