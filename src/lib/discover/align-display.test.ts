import { expect, test } from 'vitest';
import { GRID_SIZE } from '#core/grid.ts';
import { alignDisplaySeries } from './align-display.ts';

test('removes a known arbitrary level without changing shape, gaps or original data', () => {
	const reference = new Float64Array(GRID_SIZE).fill(80);
	const candidate = new Float64Array(GRID_SIZE).fill(87);
	candidate[0] = NaN;
	const aligned = alignDisplaySeries([
		{ id: 'r', label: 'Reference', values: reference },
		{ id: 'c', label: 'Candidate', values: candidate }
	]);
	expect(aligned[0]?.values).toBe(reference);
	expect(aligned[1]?.values[1]).toBeCloseTo(80, 10);
	expect(aligned[1]?.values[0]).toBeNaN();
	expect(candidate[1]).toBe(87);
	expect(aligned[1]?.attribution).toContain('display level-aligned to Reference');
});

test('cannot manufacture aligned data without shared coverage', () => {
	expect(() =>
		alignDisplaySeries([
			{ id: 'r', label: 'Reference', values: new Float64Array(GRID_SIZE).fill(NaN) },
			{ id: 'c', label: 'Candidate', values: new Float64Array(GRID_SIZE).fill(0) }
		])
	).toThrow('Insufficient overlapping data');
	expect(alignDisplaySeries([])).toEqual([]);
});
