import type { FrSeries } from '#lib/chart.ts';
import { alignDisplaySeries } from './align-display.ts';

/** Never compare differences across disjoint display-alignment coordinates. */
export function detailGroups(series: readonly FrSeries[]) {
	const groups: { id: string; label: string; baselineId: string; series: FrSeries[] }[] = [];
	for (const [styleIndex, original] of series.entries()) {
		const curve = { ...original, styleIndex };
		let placed = false;
		for (const group of groups) {
			const anchor = group.series[0];
			if (!anchor) continue;
			try {
				const aligned = alignDisplaySeries([anchor, curve]);
				group.series.push(...aligned.slice(1));
				placed = true;
				break;
			} catch {
				// This curve may still align to a different reference; keep trying.
			}
		}
		if (!placed)
			groups.push({
				id: curve.id,
				label: groups.length
					? `${curve.label} · separate alignment: insufficient shared coverage`
					: 'Detail measurements',
				baselineId: curve.id,
				series: [curve]
			});
	}
	return groups;
}
