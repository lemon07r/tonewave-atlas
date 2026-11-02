import { describe, expect, it } from 'vitest';
import { GRID } from '#core/grid.ts';
import { referenceTargets } from './targets.ts';

describe('rig-matched reference targets', () => {
	it('publishes only the requested IEM rigs with research attribution and full finite GRID coverage', async () => {
		const targets = await referenceTargets();
		expect(targets.map((t) => [t.name, t.partitions, t.form])).toEqual([
			['Harman in-ear 2019', ['iem-711'], 'iem'],
			['Diffuse field 5128', ['iem-5128'], 'iem']
		]);
		for (const target of targets) {
			expect(target.values).toHaveLength(GRID.length);
			expect(target.values.every(Number.isFinite)).toBe(true);
			expect(target.attribution).toContain('via AutoEq, github.com/jaakkopasanen/AutoEq');
		}
	});
	it('preserves the source level and uses log-Hz interpolation rather than smoothing', async () => {
		const [harman, diffuse] = await referenceTargets();
		expect(harman?.values[0]).toBe(7.61);
		expect(diffuse?.values[0]).toBe(-4.25);
		const hz = GRID[1] ?? NaN;
		const expected = 7.63 + ((7.64 - 7.63) * Math.log(hz / 20.4)) / Math.log(20.61 / 20.4);
		expect(harman?.values[1]).toBeCloseTo(expected, 12);
	});
});
