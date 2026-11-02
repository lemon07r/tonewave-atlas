import { expect, it } from 'vitest';
import { consensus, type IndexedCurve } from './index.ts';
import type { Measurement } from '../dataset/types.ts';
import { RANK_GRID } from '../grid.ts';
import { responseDistance } from '../analysis/distance.ts';
import { median } from '../analysis/common.ts';

function row(id: string, values: (i: number) => number): IndexedCurve {
	return { measurement: { id } as Measurement, values: Float64Array.from(RANK_GRID, (_, i) => values(i)) };
}
/** Phase-1 first-adequate anchor, retained as a regression oracle. */
function firstAnchor(rows: IndexedCurve[]): Float64Array {
	const anchor = rows.find((r) => responseDistance(r.values, r.values));
	if (!anchor) throw new Error('missing anchor');
	const aligned = rows.flatMap((r) => {
		const d = responseDistance(r.values, anchor.values);
		return d ? [Float64Array.from(r.values, (v) => v - d.offset)] : [];
	});
	return Float64Array.from(RANK_GRID, (_, i) => median(aligned.map((r) => r[i] ?? NaN)));
}

it('demonstrates the old outlier-first/partial-range order dependence and recovers the clean median within 1e-9 dB', () => {
	const outlier = row('outlier', (i) => (i < 60 ? 30 : -30)),
		a = row('a', () => 0),
		b = row('b', () => 0),
		partial = row('partial', (i) => (i < 72 ? 0 : NaN));
	const rows = [outlier, a, b, partial];
	expect(firstAnchor(rows)[0]).toBe(10);
	expect(firstAnchor([a, b, partial, outlier])[0]).toBe(0);
	const pooled = consensus(rows, RANK_GRID);
	expect(pooled).not.toBeNull();
	for (const v of pooled?.values ?? []) expect(Math.abs(v)).toBeLessThanOrEqual(1e-9);
});

it('is bit-identical across seeded permutations including anomalous first curves and partial overlaps', () => {
	const rows = [
		row('z', (i) => (i < 70 ? 40 - i / 3 : NaN)),
		row('a', (i) => Math.sin(i / 11)),
		row('b', (i) => 70 + Math.sin(i / 11)),
		row('c', (i) => (i > 20 ? 30 + Math.cos(i / 23) : NaN))
	];
	const expected = consensus(rows, RANK_GRID);
	let state = 42;
	for (let run = 0; run < 100; run++) {
		const shuffled = rows.slice();
		for (let i = shuffled.length - 1; i > 0; i--) {
			state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
			const j = state % (i + 1),
				a = shuffled[i],
				b = shuffled[j];
			if (a && b) {
				shuffled[i] = b;
				shuffled[j] = a;
			}
		}
		expect(consensus(shuffled, RANK_GRID)).toEqual(expected);
	}
});

it('chooses the overlap bridge, preserves incomplete range gaps and excludes inadequately overlapping sources', () => {
	const full = row('full', (i) => (i >= 10 && i < 110 ? 7 : NaN));
	const low = row('low', (i) => (i >= 10 && i < 80 ? 20 : NaN));
	const high = row('high', (i) => (i >= 40 && i < 110 ? -10 : NaN));
	const sparse = row('sparse', (i) => (i < 20 ? 0 : NaN));
	const pooled = consensus([sparse, low, high, full], RANK_GRID);
	expect(pooled?.aligned.map((r) => r.measurement.id)).toEqual(['full', 'high', 'low']);
	expect(pooled?.values[0]).toBeNaN();
	expect(pooled?.values[119]).toBeNaN();
	for (let i = 10; i < 110; i++) expect(pooled?.values[i]).toBe(7);
});
