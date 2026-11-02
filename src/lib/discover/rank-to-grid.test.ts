import { expect, test } from 'vitest';
import { rankToGrid } from './rank-to-grid.ts';

test('preserves every rank point and interpolates only between finite neighbours', () => {
	const input = Float64Array.from({ length: 120 }, (_, i) => i * 4 - 10);
	const output = rankToGrid(input);
	expect(output.length).toBe(240);
	for (let i = 0; i < 120; i++) expect(output[2 * i]).toBe(input[i]);
	expect(output[1]).toBe(-8);
	expect(output[237]).toBe(464);
	expect(output[239]).toBeNaN();
	expect(input[0]).toBe(-10);
});

test('keeps gaps on both sides and rejects a measured GRID array', () => {
	const input = new Float64Array(120).fill(2);
	input[1] = NaN;
	const output = rankToGrid(input);
	expect(Array.from(output.slice(0, 5))).toEqual([2, NaN, NaN, NaN, 2]);
	expect(() => rankToGrid(new Float64Array(240))).toThrow(RangeError);
});
