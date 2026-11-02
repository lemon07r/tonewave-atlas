import { RANK_GRID, RANK_SIZE } from '../grid.ts';
import { BANDS, bandIndex, frequenciesFor, sameLength, type Band, type Curve } from './common.ts';

export interface DistanceOptions {
	frequencies?: Curve;
	weights?: Curve;
	minHz?: number;
	maxHz?: number;
	minPoints?: number;
	minCoverage?: number;
	/** Deliberately directional; omit for a symmetric distance. */
	treblePenalty?: number;
}
export interface BandDistance {
	band: Band;
	meanDb: number | null;
	rmsDb: number | null;
	contribution: number;
	coverage: number;
}
export interface DistanceResult {
	distance: number;
	offset: number;
	tilt: number;
	coverage: number;
	points: number;
	bands: BandDistance[];
}

/** Stable two-pass moments; the packed scanner below inlines these without allocating a result. */
function scalar(
	a: Curve,
	start: number,
	b: Curve,
	f: Curve,
	options: DistanceOptions
): {
	distance: number;
	offset: number;
	coverage: number;
	points: number;
} | null {
	let sw = 0,
		se = 0,
		eligible = 0,
		points = 0;
	const low = options.minHz ?? 20,
		high = options.maxHz ?? 20000;
	for (let i = 0; i < b.length; i++) {
		const hz = f[i] ?? NaN,
			w = options.weights?.[i] ?? 1;
		if (!(Number.isFinite(hz) && hz >= low && hz <= high && w > 0 && Number.isFinite(w))) continue;
		eligible++;
		const e = (a[start + i] ?? NaN) - (b[i] ?? NaN);
		if (!Number.isFinite(e)) continue;
		sw += w;
		se += w * e;
		points++;
	}
	const coverage = eligible ? points / eligible : 0;
	if (points < (options.minPoints ?? 12) || coverage < (options.minCoverage ?? 0.5) || !sw) return null;
	const offset = se / sw;
	let sse = 0;
	for (let i = 0; i < b.length; i++) {
		const hz = f[i] ?? NaN,
			w = options.weights?.[i] ?? 1;
		const e = (a[start + i] ?? NaN) - (b[i] ?? NaN) - offset;
		if (!(
			Number.isFinite(hz) &&
			hz >= low &&
			hz <= high &&
			w > 0 &&
			Number.isFinite(w) &&
			Number.isFinite(e)
		))
			continue;
		const alpha = e > 0 && hz >= 2000 && hz <= 10000 ? Math.max(1, options.treblePenalty ?? 1) : 1;
		sse += w * e * e * alpha;
	}
	return { distance: Math.sqrt(sse / sw), offset, coverage, points };
}

export function responseDistance(a: Curve, b: Curve, options: DistanceOptions = {}): DistanceResult | null {
	sameLength(a, b);
	if (options.weights) sameLength(a, options.weights);
	const f = frequenciesFor(a, options.frequencies);
	const result = scalar(a, 0, b, f, options);
	if (!result) return null;
	const sums = BANDS.map(() => ({ w: 0, mean: 0, square: 0, energy: 0, n: 0, total: 0 }));
	let sw = 0,
		sx = 0,
		sy = 0,
		sxx = 0,
		sxy = 0,
		totalEnergy = 0;
	for (let i = 0; i < a.length; i++) {
		const hz = f[i] ?? NaN,
			w = options.weights?.[i] ?? 1;
		if (!(
			Number.isFinite(hz) &&
			hz >= (options.minHz ?? 20) &&
			hz <= (options.maxHz ?? 20000) &&
			w > 0 &&
			Number.isFinite(w)
		))
			continue;
		const band = sums[bandIndex(hz)];
		if (band) band.total++;
		const e = (a[i] ?? NaN) - (b[i] ?? NaN) - result.offset;
		if (!Number.isFinite(e)) continue;
		const x = Math.log2(hz);
		sw += w;
		sx += w * x;
		sy += w * e;
		sxx += w * x * x;
		sxy += w * x * e;
		const alpha = e > 0 && hz >= 2000 && hz <= 10000 ? Math.max(1, options.treblePenalty ?? 1) : 1;
		const energy = w * e * e * alpha;
		totalEnergy += energy;
		if (band) {
			band.w += w;
			band.mean += w * e;
			band.square += w * e * e;
			band.energy += energy;
			band.n++;
		}
	}
	return {
		...result,
		tilt: sxx - (sx * sx) / sw > 1e-12 ? (sxy - (sx * sy) / sw) / (sxx - (sx * sx) / sw) : 0,
		bands: BANDS.map((band, i) => {
			const s = sums[i];
			return {
				band: band.id,
				meanDb: s?.w ? s.mean / s.w : null,
				rmsDb: s?.w ? Math.sqrt(s.square / s.w) : null,
				contribution: totalEnergy && s ? s.energy / totalEnergy : 0,
				coverage: s?.total ? s.n / s.total : 0
			};
		})
	};
}

export interface RankedMatch {
	index: number;
	stats: DistanceResult;
}
export interface RankingResult {
	matches: RankedMatch[];
	evaluated: number;
	insufficient: number;
}

/** O(N log K), no row views or objects allocated in the N-row scan. Detailed stats only for K winners. */
export function rankPacked(
	matrix: Float32Array,
	reference: Curve,
	topK = 20,
	options: DistanceOptions = {}
): RankingResult {
	if (reference.length !== RANK_SIZE || matrix.length % RANK_SIZE)
		throw new RangeError('Expected N × 120 ranking matrix');
	if (options.weights) sameLength(reference, options.weights);
	const f = frequenciesFor(reference, options.frequencies ?? RANK_GRID);
	const n = matrix.length / RANK_SIZE,
		k = Math.min(n, Math.max(0, Math.floor(topK)));
	const indices = new Int32Array(k),
		scores = new Float64Array(k);
	let size = 0,
		insufficient = 0;
	// Per-row local accumulators avoid allocating a scalar result during the scan.
	for (let row = 0; row < n; row++) {
		let sw = 0,
			se = 0,
			count = 0,
			eligible = 0;
		const start = row * RANK_SIZE;
		for (let i = 0; i < RANK_SIZE; i++) {
			const hz = f[i] ?? NaN,
				w = options.weights?.[i] ?? 1;
			if (!(
				Number.isFinite(hz) &&
				hz >= (options.minHz ?? 20) &&
				hz <= (options.maxHz ?? 20000) &&
				w > 0 &&
				Number.isFinite(w)
			))
				continue;
			eligible++;
			const e = (matrix[start + i] ?? NaN) - (reference[i] ?? NaN);
			if (Number.isFinite(e)) {
				sw += w;
				se += w * e;
				count++;
			}
		}
		if (!sw || count < (options.minPoints ?? 12) || count / eligible < (options.minCoverage ?? 0.5)) {
			insufficient++;
			continue;
		}
		const offset = se / sw;
		let sse = 0;
		for (let i = 0; i < RANK_SIZE; i++) {
			const hz = f[i] ?? NaN,
				w = options.weights?.[i] ?? 1;
			const e = (matrix[start + i] ?? NaN) - (reference[i] ?? NaN) - offset;
			if (!(
				Number.isFinite(hz) &&
				hz >= (options.minHz ?? 20) &&
				hz <= (options.maxHz ?? 20000) &&
				w > 0 &&
				Number.isFinite(w) &&
				Number.isFinite(e)
			))
				continue;
			sse += w * e * e * (e > 0 && hz >= 2000 && hz <= 10000 ? Math.max(1, options.treblePenalty ?? 1) : 1);
		}
		const score = Math.sqrt(sse / sw);
		if (!k || (size === k && score >= (scores[0] ?? Infinity))) continue;
		let pos = size < k ? size++ : 0;
		indices[pos] = row;
		scores[pos] = score;
		if (pos) {
			while (pos > 0) {
				const parent = (pos - 1) >> 1;
				if ((scores[parent] ?? 0) >= score) break;
				scores[pos] = scores[parent] ?? 0;
				indices[pos] = indices[parent] ?? 0;
				pos = parent;
			}
			scores[pos] = score;
			indices[pos] = row;
		} else {
			while (2 * pos + 1 < size) {
				let child = 2 * pos + 1;
				if (child + 1 < size && (scores[child + 1] ?? 0) > (scores[child] ?? 0)) child++;
				if ((scores[child] ?? 0) <= score) break;
				scores[pos] = scores[child] ?? 0;
				indices[pos] = indices[child] ?? 0;
				pos = child;
			}
			scores[pos] = score;
			indices[pos] = row;
		}
	}
	const matches: RankedMatch[] = [];
	for (let i = 0; i < size; i++) {
		const index = indices[i] ?? 0;
		const stats = responseDistance(
			matrix.subarray(index * RANK_SIZE, (index + 1) * RANK_SIZE),
			reference,
			options
		);
		if (stats) matches.push({ index, stats });
	}
	matches.sort((a, b) => a.stats.distance - b.stats.distance || a.index - b.index);
	return { matches, evaluated: n, insufficient };
}
