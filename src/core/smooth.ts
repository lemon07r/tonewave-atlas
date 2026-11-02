import { GRID_POINTS_PER_OCTAVE } from './grid.ts';

/**
 * Fractional-octave smoothing of a curve sampled on a uniform log-frequency grid, done in the dB domain.
 *
 * Uses a Gaussian kernel in log-frequency whose standard deviation is chosen so the kernel's
 * equivalent rectangular bandwidth equals 1/fraction octave (σ = bw / √(2π)). NaN samples are skipped
 * and the remaining weights renormalised, so smoothing never invents data beyond the measured range:
 * output is NaN wherever the input is NaN.
 *
 * @param fraction 1/N-octave bandwidth denominator (e.g. 12 for 1/12 octave). `0` returns a copy.
 * @param pointsPerOctave grid density of `values`.
 */
export function smoothOctave(
	values: ArrayLike<number>,
	fraction: number,
	pointsPerOctave: number = GRID_POINTS_PER_OCTAVE
): Float64Array {
	const n = values.length;
	const out = new Float64Array(n);
	if (fraction <= 0) {
		for (let i = 0; i < n; i++) out[i] = values[i] ?? NaN;
		return out;
	}
	const sigma = pointsPerOctave / fraction / Math.sqrt(2 * Math.PI);
	const radius = Math.max(1, Math.ceil(3 * sigma));
	const kernel = new Float64Array(2 * radius + 1);
	for (let j = -radius; j <= radius; j++) kernel[j + radius] = Math.exp(-0.5 * (j / sigma) ** 2);

	for (let i = 0; i < n; i++) {
		const centre = values[i] ?? NaN;
		if (Number.isNaN(centre)) {
			out[i] = NaN;
			continue;
		}
		let sum = 0;
		let weight = 0;
		const lo = Math.max(0, i - radius);
		const hi = Math.min(n - 1, i + radius);
		for (let j = lo; j <= hi; j++) {
			const v = values[j] ?? NaN;
			if (Number.isNaN(v)) continue;
			const w = kernel[j - i + radius] ?? 0;
			sum += w * v;
			weight += w;
		}
		out[i] = sum / weight;
	}
	return out;
}
