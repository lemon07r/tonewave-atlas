/**
 * Canonical log-frequency grid shared by ingestion, storage, analysis and display.
 * f_k = 20 · 2^(k / 24) Hz for k = 0…239: 1/24-octave spacing from 20 Hz to ≈19.9 kHz.
 */
export const GRID_POINTS_PER_OCTAVE = 24;
export const GRID_SIZE = 240;
export const GRID_F0 = 20;

export const GRID: Float64Array = Float64Array.from(
	{ length: GRID_SIZE },
	(_, k) => GRID_F0 * 2 ** (k / GRID_POINTS_PER_OCTAVE)
);

/** Fractional grid index of a frequency (may be out of range). */
export function gridIndex(hz: number): number {
	return Math.log2(hz / GRID_F0) * GRID_POINTS_PER_OCTAVE;
}

/** Coarser view used for ranking: every `step`-th grid point (step 2 → 1/12 octave, 120 points). */
export const RANK_STEP = 2;
export const RANK_SIZE = GRID_SIZE / RANK_STEP;
export const RANK_GRID: Float64Array = Float64Array.from(
	{ length: RANK_SIZE },
	(_, i) => GRID[i * RANK_STEP] ?? 0
);
