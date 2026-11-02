import { GRID, GRID_SIZE } from '#core/grid.ts';

export interface FrSeries {
	id: string;
	label: string;
	values: Float64Array | Float32Array;
	lo?: Float64Array | Float32Array;
	hi?: Float64Array | Float32Array;
	reference?: boolean;
	/** Human-readable source, rig and processing details, also included in PNG exports. */
	attribution?: string;
}

export const FREQUENCY_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
export const CURVE_DASHES: number[][] = [[], [8, 3], [3, 3], [10, 3, 2, 3], [5, 2], [2, 4], [12, 4]];

export const REGIONS = [
	{
		label: 'Sub-bass',
		short: 'Sub',
		lo: 20,
		hi: 60,
		description:
			'20–60 Hz. More energy here may add low rumble or weight, depending on the recording and seal.'
	},
	{
		label: 'Mid-bass',
		short: 'Bass',
		lo: 60,
		hi: 200,
		description:
			'60–200 Hz. A difference here may change the sense of bass punch or warmth; fit also matters.'
	},
	{
		label: 'Lower mids',
		short: 'Low mids',
		lo: 200,
		hi: 500,
		description:
			'200–500 Hz. More energy may add body to voices and instruments, or sound fuller in some mixes.'
	},
	{
		label: 'Vocal presence',
		short: 'Presence',
		lo: 500,
		hi: 2000,
		description: '500 Hz–2 kHz. Differences may affect how forward some voices and instruments seem.'
	},
	{
		label: 'Upper mids',
		short: 'Up mids',
		lo: 2000,
		hi: 5000,
		description:
			'2–5 kHz. More energy may emphasise vocal edges or attack. Ear shape and listening level matter.'
	},
	{
		label: 'Treble',
		short: 'Treble',
		lo: 5000,
		hi: 10000,
		description:
			'5–10 kHz. Differences may affect sibilance and cymbal texture. Insertion depth can strongly change measurements here.'
	},
	{
		label: 'Air',
		short: 'Air',
		lo: 10000,
		hi: 20000,
		description:
			'10–20 kHz. This region may relate to a sense of air, but measurements and individual hearing are particularly uncertain.'
	}
] as const;

export function frequencyLabel(hz: number): string {
	return hz >= 1000 ? `${Number((hz / 1000).toFixed(1))}k` : `${Math.round(hz)}`;
}
export function dbLabel(value: number | null | undefined, signed = false): string {
	return value == null || !Number.isFinite(value)
		? '—'
		: `${signed && value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

/** Nulls, rather than NaNs, tell uPlot to preserve an explicit gap. No interpolation or alignment. */
export function chartValues(values: ArrayLike<number>, baseline?: ArrayLike<number>): (number | null)[] {
	if (values.length !== GRID_SIZE || (baseline && baseline.length !== GRID_SIZE))
		throw new RangeError(`Curves must have ${GRID_SIZE} points on GRID.`);
	return Array.from(GRID, (_, i) => {
		const value = values[i];
		const base = baseline ? baseline[i] : 0;
		return value !== undefined && base !== undefined && Number.isFinite(value) && Number.isFinite(base)
			? value - base
			: null;
	});
}

/** Whole 5 dB limits with at least 10 dB of space; includes uncertainty envelopes. */
export function chartRange(arrays: readonly (readonly (number | null)[])[]): [number, number] {
	let min = Infinity;
	let max = -Infinity;
	for (const array of arrays)
		for (const value of array)
			if (value !== null && Number.isFinite(value)) {
				min = Math.min(min, value);
				max = Math.max(max, value);
			}
	if (!Number.isFinite(min)) return [-15, 15];
	const centre = (min + max) / 2;
	return [
		Math.floor((Math.min(min, centre - 5) - 2) / 5) * 5,
		Math.ceil((Math.max(max, centre + 5) + 2) / 5) * 5
	];
}
