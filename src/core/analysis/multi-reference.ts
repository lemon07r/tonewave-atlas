import { type Curve } from './common.ts';
import { responseDistance, type DistanceOptions } from './distance.ts';

export interface MultiReferenceResult {
	distances: (number | null)[];
	mean: number | null;
	minimax: number | null;
	pareto: boolean;
}

export function compareReferences(
	candidates: readonly Curve[],
	references: readonly Curve[],
	options: DistanceOptions = {}
): MultiReferenceResult[] {
	if (references.length < 2 || references.length > 4) throw new RangeError('Use 2–4 references');
	const results = candidates.map((candidate) => {
		const distances = references.map((r) => responseDistance(candidate, r, options)?.distance ?? null);
		const complete = distances.every((d): d is number => d !== null);
		return {
			distances,
			mean: complete ? distances.reduce((a, b) => a + b, 0) / distances.length : null,
			minimax: complete ? Math.max(...distances) : null,
			pareto: false
		};
	});
	for (const result of results) {
		if (result.mean === null) continue;
		result.pareto = !results.some(
			(other) =>
				other !== result &&
				other.mean !== null &&
				other.distances.every((d, i) => d !== null && d <= (result.distances[i] ?? -Infinity)) &&
				other.distances.some((d, i) => d !== null && d < (result.distances[i] ?? -Infinity))
		);
	}
	return results;
}
