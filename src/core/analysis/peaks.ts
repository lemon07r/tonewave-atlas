import { smoothOctave } from '../smooth.ts';
import { frequenciesFor, type Curve } from './common.ts';

export interface NarrowPeak {
	frequency: number;
	heightDb: number;
	q: number;
	lowReliability: boolean;
}
export interface PeakAnalysis {
	broad: Float64Array;
	narrow: Float64Array;
	peaks: NarrowPeak[];
}

export function detectNarrowPeaks(error: Curve, frequencies?: Curve, thresholdDb = 1): PeakAnalysis {
	const f = frequenciesFor(error, frequencies);
	const ppo = 1 / Math.log2((f[1] ?? 40) / (f[0] ?? 20));
	const broad = smoothOctave(error, 3, ppo);
	const narrow = Float64Array.from(error, (v, i) => v - (broad[i] ?? NaN));
	const peaks: NarrowPeak[] = [];
	for (let i = 1; i < error.length - 1; i++) {
		const h = narrow[i] ?? NaN;
		if (!(h >= thresholdDb && h > (narrow[i - 1] ?? Infinity) && h >= (narrow[i + 1] ?? Infinity))) continue;
		let left = i,
			right = i;
		while (left > 0 && (narrow[left] ?? 0) > h / 2) left--;
		while (right < error.length - 1 && (narrow[right] ?? 0) > h / 2) right++;
		const frequency = f[i] ?? NaN;
		peaks.push({
			frequency,
			heightDb: h,
			q: frequency / ((f[right] ?? frequency) - (f[left] ?? frequency)),
			lowReliability: frequency > 8000
		});
	}
	return { broad, narrow, peaks };
}
