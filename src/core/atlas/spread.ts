import { GRID } from '../grid.ts';
import { consensus, type IndexedCurve } from './index.ts';
import type { ProductSpread } from './types.ts';

/** Observed, level-aligned min/max and support; not a confidence interval. */
export function spreadFor(curves: IndexedCurve[], partition: string): ProductSpread | null {
	const pooled = consensus(curves, GRID);
	if (!pooled) return null;
	const min = new Float64Array(GRID.length).fill(NaN),
		max = min.slice();
	const support = new Uint16Array(GRID.length);
	for (let i = 0; i < GRID.length; i++) {
		const finite = pooled.aligned.map((c) => c.values[i] ?? NaN).filter(Number.isFinite);
		support[i] = finite.length;
		if (finite.length) {
			min[i] = Math.min(...finite);
			max[i] = Math.max(...finite);
		}
	}
	return {
		partition,
		measurementIds: pooled.aligned.map((c) => c.measurement.id),
		sourceCount: new Set(pooled.aligned.map((c) => c.measurement.sourceId)).size,
		centre: pooled.values,
		min,
		max,
		support
	};
}
