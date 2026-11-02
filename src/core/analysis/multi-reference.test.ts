import { describe, expect, it } from 'vitest';
import { paretoMembership, compareReferences } from './multi-reference.ts';
import { RANK_GRID } from '../grid.ts';

/** Original exhaustive definition, deliberately independent of sorting or sweep data structures. */
function exhaustive(points: readonly (readonly (number | null)[])[]): boolean[] {
	return points.map(
		(point) =>
			point.every((v) => v !== null && Number.isFinite(v)) &&
			!points.some(
				(other) =>
					other.every((v) => v !== null && Number.isFinite(v)) &&
					other.every((v, i) => (v ?? Infinity) <= (point[i] ?? -Infinity)) &&
					other.some((v, i) => (v ?? Infinity) < (point[i] ?? -Infinity))
			)
	);
}

describe('Pareto sweep against exhaustive oracle', () => {
	it.each([2, 3, 4])(
		'matches seeded randomized %i-objective fronts with ties, duplicates and missing values',
		(dimensions) => {
			for (const seed of [1, 42, 0xdeadbeef, 1911]) {
				let state = seed;
				const random = () => {
					state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
					return state / 2 ** 32;
				};
				const points: (number | null)[][] = Array.from({ length: 800 }, () =>
					Array.from({ length: dimensions }, () => Math.floor(random() * 30))
				);
				points.push(...points.slice(0, 40).map((p) => [...p]));
				for (const value of [null, NaN, Infinity, -Infinity])
					for (let axis = 0; axis < dimensions; axis++) {
						const point: (number | null)[] = new Array<number>(dimensions).fill(0);
						point[axis] = value;
						points.push(point);
					}
				expect(paretoMembership(points)).toEqual(exhaustive(points));
			}
		}
	);
	it.each([2, 3, 4])(
		'preserves every duplicate on a tied %i-objective front and rejects equal-prefix domination',
		(dimensions) => {
			const points = [
				new Array<number>(dimensions).fill(1),
				new Array<number>(dimensions).fill(1),
				...Array.from({ length: dimensions }, (_, axis) =>
					Array.from({ length: dimensions }, (_, i) => (i === axis ? 2 : 1))
				)
			];
			expect(paretoMembership(points)).toEqual([true, true, ...new Array<boolean>(dimensions).fill(false)]);
			expect(paretoMembership(points.slice().reverse())).toEqual(exhaustive(points.slice().reverse()));
		}
	);
	it.each([2, 3, 4])(
		'matches the exhaustive oracle on 3000 adversarial all-nondominated %i-objective points',
		(dimensions) => {
			const points = Array.from({ length: 3000 }, (_, i) =>
				[i, 3000 - i, i % 7, i % 11].slice(0, dimensions)
			);
			expect(paretoMembership(points)).toEqual(exhaustive(points));
			expect(paretoMembership(points).every(Boolean)).toBe(true);
		}
	);
	it('handles empty input and rejects inconsistent objective counts', () => {
		expect(paretoMembership([])).toEqual([]);
		expect(() => paretoMembership([[1]])).toThrow(RangeError);
		expect(() =>
			paretoMembership([
				[1, 2],
				[1, 2, 3]
			])
		).toThrow(RangeError);
	});
	it('keeps missing-reference aggregates null and never marks them Pareto', () => {
		const flat = new Float64Array(RANK_GRID.length);
		const missing = new Float64Array(RANK_GRID.length).fill(NaN);
		const results = compareReferences([flat, missing], [flat, flat]);
		expect(results).toEqual([
			{ distances: [0, 0], mean: 0, minimax: 0, pareto: true },
			{ distances: [null, null], mean: null, minimax: null, pareto: false }
		]);
	});
});
