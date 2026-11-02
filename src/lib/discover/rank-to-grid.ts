import { GRID_SIZE, RANK_SIZE } from '#core/grid.ts';

/** Display only: derived taste centres, never measured product curves. No extrapolation. */
export function rankToGrid(values: ArrayLike<number>): Float64Array {
	if (values.length !== RANK_SIZE) throw new RangeError(`Expected ${RANK_SIZE} rank samples.`);
	return Float64Array.from({ length: GRID_SIZE }, (_, index) => {
		const left = values[Math.floor(index / 2)] ?? NaN;
		if (index % 2 === 0) return left;
		const right = values[Math.floor(index / 2) + 1] ?? NaN;
		return Number.isFinite(left) && Number.isFinite(right) ? (left + right) / 2 : NaN;
	});
}
