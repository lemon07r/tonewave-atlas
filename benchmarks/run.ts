import { cpus } from 'node:os';
import { GRID, RANK_GRID, RANK_SIZE } from '../src/core/grid.ts';
import { rankPacked } from '../src/core/analysis/distance.ts';
import { makeWeights } from '../src/core/analysis/weights.ts';
import { buildTasteModel, rankTasteCandidates, type RatedItem } from '../src/core/analysis/taste.ts';
import { equalizerResponse, type Filter } from '../src/core/analysis/biquad.ts';
import { fitPeq } from '../src/core/analysis/peq.ts';

const n = 30000,
	matrix = new Float32Array(n * RANK_SIZE);
// Deterministic broad shapes, not a claim about the distribution of real products.
for (let row = 0; row < n; row++)
	for (let i = 0; i < RANK_SIZE; i++) {
		const f = RANK_GRID[i] ?? 20;
		matrix[row * RANK_SIZE + i] =
			(((row % 31) - 15) * 0.2) / (1 + (f / 180) ** 2) +
			Math.sin(i / 17 + row * 0.013) * 1.5 +
			Math.cos(i / 9) * ((row % 13) - 6) * 0.12;
	}
const weights = makeWeights(RANK_GRID),
	reference = matrix.subarray(0, RANK_SIZE);
const curves = Array.from({ length: n }, (_, i) => matrix.subarray(i * RANK_SIZE, (i + 1) * RANK_SIZE));
const rated: RatedItem[] = [0, 1, 2, 300, 700].map((row, i) => ({
	id: String(row),
	curve: curves[row] ?? reference,
	rating: i < 3 ? 'like' : 'dislike',
	strength: 1,
	soundRelated: true,
	...(i === 3 ? { dislikeReasons: ['too-much-bass'] as const } : {})
}));
const model = buildTasteModel(rated);
const syntheticFilters: Filter[] = [
	{ type: 'low-shelf', frequency: 100, gain: 4, q: 0.707 },
	{ type: 'peak', frequency: 2200, gain: -4, q: 1.5 },
	{ type: 'high-shelf', frequency: 6500, gain: 2, q: 0.7 }
];
const target = equalizerResponse(syntheticFilters),
	flat = new Float64Array(GRID.length);
let checksum = 0;
function time(name: string, operations: number, run: () => number): void {
	const start = performance.now();
	checksum += run();
	const ms = performance.now() - start;
	console.log(`${name}: ${ms.toFixed(2)} ms | ${((operations * 1000) / ms).toFixed(0)} ops/s`);
}
console.log(
	`Node ${process.version}; ${cpus()[0]?.model ?? 'unknown CPU'}; N=${n}, grid=${RANK_SIZE}, topK=20`
);
// Warm up each distinct path outside the measured region.
rankPacked(matrix, reference, 20, { weights });
rankTasteCandidates(curves.slice(0, 100), model);
fitPeq(flat, target);
time(
	'single-reference rank (30000 candidates)',
	n,
	() => rankPacked(matrix, reference, 20, { weights }).matches[0]?.stats.distance ?? 0
);
time(
	'taste rank (30000 candidates, 3 likes + 2 dislikes)',
	n,
	() => rankTasteCandidates(curves, model)[0]?.fit.score ?? 0
);
time('PEQ fit (1 curve)', 1, () => fitPeq(flat, target)?.residualDistanceDb ?? 0);
time('PEQ fit (50 curves)', 50, () => {
	let sum = 0;
	for (let i = 0; i < 50; i++)
		sum +=
			fitPeq(
				flat,
				Float64Array.from(target, (v, j) => v + 0.1 * Math.sin(j / 17 + i))
			)?.residualDistanceDb ?? 0;
	return sum;
});
console.log(`checksum ${checksum.toFixed(6)}`);
