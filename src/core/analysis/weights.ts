import { bandIndex, BANDS, clamp, type Band, type Curve } from './common.ts';

const RELIABILITY_FLOOR_DB = 1;
export type Focus = 'balanced' | 'bass' | 'vocals' | 'treble';
export interface WeightOptions {
	spread?: Curve;
	focus?: Focus;
	bandMultipliers?: Partial<Record<Band, number>>;
}

/** Conservative placeholder, not an empirical rig-error model. */
export function defaultSpreadDb(hz: number): number {
	if (hz < 100) return 1.5;
	if (hz <= 4000) return 1;
	if (hz <= 8000) return 1 + 2 * Math.log2(hz / 4000);
	return Math.min(6, 3 + 3 * Math.log2(hz / 8000));
}

export function makeWeights(frequencies: Curve, options: WeightOptions = {}): Float64Array {
	if (options.spread && options.spread.length !== frequencies.length)
		throw new RangeError('Spread/grid length mismatch');
	for (const multiplier of Object.values(options.bandMultipliers ?? {}))
		if (!Number.isFinite(multiplier) || multiplier < 0)
			throw new RangeError('Band multipliers must be finite and nonnegative');
	const reliability = new Float64Array(frequencies.length);
	let sum = 0,
		count = 0;
	for (let i = 0; i < frequencies.length; i++) {
		const hz = frequencies[i] ?? NaN,
			input = options.spread?.[i] ?? NaN;
		const sigma = Number.isFinite(input) && input >= 0 ? input : defaultSpreadDb(hz);
		const r = hz >= 20 && hz <= 20000 ? 1 / (RELIABILITY_FLOOR_DB ** 2 + sigma ** 2) : 0;
		reliability[i] = r;
		sum += r;
		if (r) count++;
	}
	return Float64Array.from(reliability, (r, i) => {
		const f = frequencies[i] ?? NaN;
		let focus = 1;
		if (f > 8000 && f <= 12000) focus = 0.25 + (0.75 * (1 + Math.cos((Math.PI * (f - 8000)) / 4000))) / 2;
		else if (f > 12000) focus = 0.1 + (0.15 * (1 + Math.cos(Math.PI * clamp((f - 12000) / 4000, 0, 1)))) / 2;
		if (options.focus === 'bass' && f < 250) focus *= 3;
		if (options.focus === 'vocals' && f >= 250 && f < 5000) focus *= 3;
		if (options.focus === 'treble' && f >= 2000 && f <= 10000) focus *= 3;
		const band = BANDS[bandIndex(f)];
		const custom = band ? (options.bandMultipliers?.[band.id] ?? 1) : 1;
		return sum ? ((r * count) / sum) * focus * custom : 0;
	});
}
