import { expect, test } from 'vitest';
import { GRID } from '#core/grid.ts';
import { detailGroups } from './detail-groups.ts';

test('isolates disjoint overlays while retaining the reference and every valid detail curve', () => {
	const low = Float64Array.from(GRID, (hz) => (hz <= 1000 ? 80 : NaN));
	const high = Float64Array.from(GRID, (hz) => (hz >= 2000 ? 90 : NaN));
	const groups = detailGroups([
		{ id: 'ref', label: 'Reference', values: low, reference: true },
		{ id: 'disjoint', label: 'Disjoint overlay', values: high },
		{ id: 'valid', label: 'Valid overlay', values: Float64Array.from(low, (v) => v + 7) }
	]);
	expect(groups.map((group) => group.series.map((s) => s.id))).toEqual([['ref', 'valid'], ['disjoint']]);
	expect(groups.map((group) => group.baselineId)).toEqual(['ref', 'disjoint']);
	expect(groups[1]?.label).toContain('insufficient shared coverage');
	expect(groups[0]?.series[1]?.values[0]).toBeCloseTo(80, 10);
	expect(groups[1]?.series[0]?.values).toBe(high);
});
