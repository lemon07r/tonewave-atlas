import { describe, expect, test } from 'vitest';
import { GRID_SIZE } from '#core/grid.ts';
import {
	chartValues,
	chartRange,
	dbLabel,
	frequencyLabel,
	CURVE_DASHES,
	curveDash,
	nearestFrequencyIndex
} from './chart.ts';

describe('chart display data', () => {
	test('uses eight distinct slot patterns with the primary series solid and a complete repeat in a 48 px legend', () => {
		const patterns = CURVE_DASHES;
		expect(new Set(patterns.map((pattern) => pattern.join(' '))).size).toBe(8);
		expect(curveDash(7)).not.toEqual(curveDash(0));
		expect(patterns.every((pattern) => pattern.reduce((sum, value) => sum + value, 0) <= 48)).toBe(true);
		expect(curveDash(1)).toEqual([14, 5]);
		expect(curveDash(0)).toEqual([]);
		expect(curveDash(2)).toEqual([4, 4]);
	});
	test('inspects the nearest 1 kHz bin by default and preserves a requested frequency on another grid', () => {
		expect(nearestFrequencyIndex([20, 900, 1101, 20000])).toBe(1);
		expect(nearestFrequencyIndex([20, 900, 1101, 20000], 1100)).toBe(2);
	});
	test('subtracts the baseline pointwise, retaining missing coverage on either side', () => {
		const values = new Float64Array(GRID_SIZE).fill(7);
		const baseline = new Float32Array(GRID_SIZE).fill(2);
		values[1] = NaN;
		baseline[2] = NaN;
		const result = chartValues(values, baseline);
		expect(result.slice(0, 4)).toEqual([5, null, null, 5]);
		expect(values[0]).toBe(7);
	});
	test('never draws NaN or infinity as a number', () => {
		const values = new Float64Array(GRID_SIZE).fill(0);
		values[0] = NaN;
		values[1] = Infinity;
		values[2] = -Infinity;
		expect(chartValues(values).slice(0, 4)).toEqual([null, null, null, 0]);
	});
	test('turns finite-input subtraction overflow into an explicit gap', () => {
		const values = new Float64Array(GRID_SIZE).fill(Number.MAX_VALUE);
		const baseline = new Float64Array(GRID_SIZE).fill(-Number.MAX_VALUE);
		expect(chartValues(values, baseline).every((value) => value === null)).toBe(true);
	});
	test('rejects noncanonical grid lengths rather than stretching data', () => {
		expect(() => chartValues([1, 2])).toThrow(RangeError);
		expect(() => chartValues(new Float32Array(GRID_SIZE), [1])).toThrow(RangeError);
	});
	test('bounds all data with outward 5 dB limits and padding', () => {
		expect(
			chartRange([
				[0, 9],
				[null, 14]
			])
		).toEqual([-5, 20]);
		expect(chartRange([[null]])).toEqual([-15, 15]);
		expect(chartRange([[0, 0]])).toEqual([-10, 10]);
	});
	test('formats only supported precision and exposes missing data', () => {
		expect(frequencyLabel(20000)).toBe('20k');
		expect(frequencyLabel(50)).toBe('50');
		expect(dbLabel(NaN)).toBe('—');
		expect(dbLabel(2.34, true)).toBe('+2.3');
		expect(dbLabel(-0.01)).toBe('0.0');
		expect(dbLabel(0.01, true)).toBe('0.0');
		expect(dbLabel(-0, true)).toBe('0.0');
	});
});
