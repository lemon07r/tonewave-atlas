import { GRID } from '../grid.ts';
import { equalizerResponse, type Filter } from './biquad.ts';
import { regionMean, sameLength, type Curve } from './common.ts';

export interface TargetOptions {
	bassShelf?: { gain: number; frequency?: number; q?: number };
	warmthDb?: number;
	tiltDbPerOctave?: number;
	presenceScale?: number;
	trebleShelf?: { gain: number; frequency?: number; q?: number };
}

/** Presence scales the base target's ear gain above its 500–1000 Hz mean, with log-frequency cosine shoulders. */
export function buildTarget(base: Curve, options: TargetOptions = {}): Float64Array {
	sameLength(base, GRID);
	for (const value of [options.warmthDb, options.tiltDbPerOctave, options.presenceScale])
		if (value !== undefined && !Number.isFinite(value))
			throw new RangeError('Target parameters must be finite');
	const filters: Filter[] = [];
	if (options.bassShelf)
		filters.push({
			type: 'low-shelf',
			gain: options.bassShelf.gain,
			frequency: options.bassShelf.frequency ?? 100,
			q: options.bassShelf.q ?? 0.707
		});
	if (options.warmthDb) filters.push({ type: 'peak', gain: options.warmthDb, frequency: 200, q: 0.7 });
	if (options.trebleShelf)
		filters.push({
			type: 'high-shelf',
			gain: options.trebleShelf.gain,
			frequency: options.trebleShelf.frequency ?? 6000,
			q: options.trebleShelf.q ?? 0.707
		});
	const response = equalizerResponse(filters),
		mid = regionMean(base, GRID, 500, 1000);
	return Float64Array.from(base, (v, i) => {
		const f = GRID[i] ?? NaN;
		let presence = 0;
		if (f >= 1000 && f <= 6000) presence = Math.sin((Math.PI * Math.log(f / 1000)) / Math.log(6)) ** 2;
		const scale = options.presenceScale ?? 1;
		return (
			v +
			(response[i] ?? 0) +
			(options.tiltDbPerOctave ?? 0) * Math.log2(f / 1000) +
			(scale !== 1 && presence > 0 && Number.isFinite(mid) ? (scale - 1) * (v - mid) * presence : 0)
		);
	});
}
