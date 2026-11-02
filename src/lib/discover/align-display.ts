import { responseDistance } from '#core/analysis/distance.ts';
import { makeWeights, type Focus } from '#core/analysis/weights.ts';
import { GRID } from '#core/grid.ts';
import type { FrSeries } from '#lib/chart.ts';

/** Remove arbitrary source levels before comparing shapes; ranking remains unchanged. */
export function alignDisplaySeries(series: FrSeries[], focus: Focus = 'balanced'): FrSeries[] {
	const anchor = series[0];
	if (!anchor) return [];
	const weights = makeWeights(GRID, { focus });
	return series.map((curve, index) => {
		if (index === 0) return curve;
		const distance = responseDistance(curve.values, anchor.values, { frequencies: GRID, weights });
		if (!distance) throw new Error('Insufficient overlapping data to level-align display curves.');
		return {
			...curve,
			values: Float64Array.from(curve.values, (value) => value - distance.offset),
			attribution: `${curve.attribution ?? ''} · display level-aligned to ${anchor.label} (weighted LS on GRID)`
		};
	});
}
