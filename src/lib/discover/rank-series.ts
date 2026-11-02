import type { FrSeries } from '#lib/chart.ts';
import type { DiscoveryResult } from './query.ts';

/** No interpolation, smoothing or second alignment: these are the exact values scored by the worker. */
export function rankedSeries(
	result: DiscoveryResult,
	overlays: readonly string[],
	nameFor: (id: string) => string
): FrSeries[] {
	const chosen = result.data.results.filter((row) => overlays.includes(row.candidate.id));
	const series: FrSeries[] = [];
	if (result.kind === 'similar')
		series.push({
			id: 'reference',
			label: result.data.reference.productId
				? nameFor(result.data.reference.productId)
				: 'Your local measurement',
			values: result.data.reference.rankCurve,
			reference: true
		});
	else if (result.kind === 'compare')
		for (const [index, reference] of result.data.references.entries())
			series.push({
				id: `reference-${index}`,
				label: nameFor(reference.productId ?? ''),
				values: reference.rankCurve,
				reference: true
			});
	else {
		const tastes = chosen.length
			? result.data.model.tastes.filter((taste) =>
					chosen.some((row) => 'tasteId' in row && row.tasteId === taste.id)
				)
			: result.data.model.tastes;
		for (const taste of tastes)
			series.push({
				id: `taste-${taste.id}`,
				label: `Taste ${taste.id + 1} centre (derived)`,
				values: taste.centre,
				reference: true
			});
	}
	for (const row of chosen) {
		if ('alignedTo' in row && row.alignedTo === null) continue;
		const alignedReference =
			result.kind === 'compare' && 'alignedTo' in row && row.alignedTo !== null
				? result.data.references[row.alignedTo]
				: undefined;
		const alignment = alignedReference ? ` · aligned to ${nameFor(alignedReference.productId ?? '')}` : '';
		series.push({
			id: row.candidate.id,
			label: `${row.candidate.product.brand} ${row.candidate.product.model}${row.candidate.variantLabel ? ` · ${row.candidate.variantLabel}` : ''}${'tasteId' in row ? ` · Taste ${row.tasteId + 1}` : ''}${alignment}`,
			values: row.rankCurve,
			attribution: `${result.data.partition} · as ranked, level-aligned${result.data.harmonised ? ', reviewer offsets corrected' : ''}`
		});
	}
	return series;
}
