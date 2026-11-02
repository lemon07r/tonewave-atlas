import { describe, expect, test } from 'vitest';
import { GRID_SIZE } from '#core/grid.ts';
import { chartValues, chartRange, dbLabel, frequencyLabel } from './chart.ts';

describe('chart display data', () => {
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
	});
});
