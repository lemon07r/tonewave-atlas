import { type Curve } from './common.ts';
import { responseDistance, type DistanceOptions } from './distance.ts';

export interface MultiReferenceResult {
	distances: (number | null)[];
	mean: number | null;
	minimax: number | null;
	pareto: boolean;
}

/** Number of sorted values <= value (also the one-based Fenwick coordinate for an exact value). */
function upperBound(sorted: readonly number[], value: number): number {
	let low = 0,
		high = sorted.length;
	while (low < high) {
		const mid = (low + high) >>> 1;
		if ((sorted[mid] ?? Infinity) <= value) low = mid + 1;
		else high = mid;
	}
	return low;
}
function unique(values: number[]): number[] {
	return [...new Set(values)].sort((a, b) => a - b);
}

/** Exact minimisation frontier: O(N log N) for 2–3 objectives, O(N log² N) for 4.
 * Lexicographic sorting means only earlier vectors can dominate a point. Equal vectors are queried
 * together before insertion, preserving duplicates. Prefix-min Fenwick trees answer dominance in
 * the remaining dimensions; incomplete/non-finite vectors never enter the tree or the front.
 */
export function paretoMembership(objectives: readonly (readonly (number | null)[])[]): boolean[] {
	const dimensions = objectives[0]?.length ?? 2;
	if (dimensions < 2 || dimensions > 4 || objectives.some((p) => p.length !== dimensions))
		throw new RangeError('Use consistent 2–4 objectives');
	const points = objectives.flatMap((values, index) =>
		values.every((v): v is number => v !== null && Number.isFinite(v)) ? [{ values, index }] : []
	);
	const compare = (a: (typeof points)[number], b: (typeof points)[number]) => {
		for (let i = 0; i < dimensions; i++) {
			const difference = (a.values[i] ?? 0) - (b.values[i] ?? 0);
			if (difference) return difference;
		}
		return 0;
	};
	points.sort(compare);
	const membership = new Array<boolean>(objectives.length).fill(false);
	const ys = unique(points.map((p) => p.values[1] ?? 0));
	const minima = new Float64Array(ys.length + 1).fill(Infinity);
	// In four dimensions each y node holds a compressed z-prefix minimum of objective four.
	const coordinates = Array.from({ length: ys.length + 1 }, () => [] as number[]);
	if (dimensions === 4)
		for (const point of points)
			for (let y = upperBound(ys, point.values[1] ?? 0); y < coordinates.length; y += y & -y)
				coordinates[y]?.push(point.values[2] ?? 0);
	const nodes = coordinates.map((values) => {
		const z = unique(values);
		return { z, minima: new Float64Array(z.length + 1).fill(Infinity) };
	});
	let bestY = Infinity;
	for (let start = 0; start < points.length;) {
		const point = points[start];
		if (!point) break;
		let end = start + 1;
		while (end < points.length) {
			const next = points[end];
			if (!next || compare(point, next) !== 0) break;
			end++;
		}
		const yRank = upperBound(ys, point.values[1] ?? 0);
		let best = dimensions === 2 ? bestY : Infinity;
		if (dimensions > 2)
			for (let y = yRank; y > 0; y -= y & -y) {
				if (dimensions === 3) best = Math.min(best, minima[y] ?? Infinity);
				else {
					const node = nodes[y];
					if (!node) continue;
					for (let z = upperBound(node.z, point.values[2] ?? 0); z > 0; z -= z & -z)
						best = Math.min(best, node.minima[z] ?? Infinity);
				}
			}
		const nondominated = best > (point.values[dimensions - 1] ?? 0);
		for (let i = start; i < end; i++) {
			const duplicate = points[i];
			if (duplicate) membership[duplicate.index] = nondominated;
		}
		bestY = Math.min(bestY, point.values[1] ?? Infinity);
		for (let y = yRank; y < minima.length; y += y & -y) {
			if (dimensions === 3) minima[y] = Math.min(minima[y] ?? Infinity, point.values[2] ?? Infinity);
			if (dimensions === 4) {
				const node = nodes[y];
				if (!node) continue;
				for (let z = upperBound(node.z, point.values[2] ?? 0); z < node.minima.length; z += z & -z)
					node.minima[z] = Math.min(node.minima[z] ?? Infinity, point.values[3] ?? Infinity);
			}
		}
		start = end;
	}
	return membership;
}

export function compareReferences(
	candidates: readonly Curve[],
	references: readonly Curve[],
	options: DistanceOptions = {}
): MultiReferenceResult[] {
	if (references.length < 2 || references.length > 4) throw new RangeError('Use 2–4 references');
	const results = candidates.map((candidate) => {
		const distances = references.map((r) => {
			const distance = responseDistance(candidate, r, options)?.distance;
			return distance !== undefined && Number.isFinite(distance) ? distance : null;
		});
		const complete = distances.every((d): d is number => d !== null);
		return {
			distances,
			mean: complete ? distances.reduce((a, b) => a + b, 0) / distances.length : null,
			minimax: complete ? Math.max(...distances) : null,
			pareto: false
		};
	});
	const membership = paretoMembership(results.map((r) => r.distances));
	results.forEach((result, i) => {
		result.pareto = membership[i] ?? false;
	});
	return results;
}
