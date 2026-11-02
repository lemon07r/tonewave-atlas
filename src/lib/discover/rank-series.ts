import type { FrSeries } from '#lib/chart.ts';
import type { DiscoveryResult } from './query.ts';
import type { Source } from '#core/dataset/types.ts';
import { rigLabel } from '#lib/rigs.ts';

/** No interpolation, smoothing or second alignment: these are the exact values scored by the worker. */
export function rankedSeries(
	result: DiscoveryResult,
	overlays: readonly string[],
	nameFor: (id: string) => string
): FrSeries[] {
	const chosen = result.data.results.filter((row) => overlays.includes(row.candidate.id));
	const series: FrSeries[] = [];
	const attribution = (sources: readonly Source[]) =>
		`${sources.map((source) => `${source.name} ${source.url}`).join('; ') || 'No measured-source attribution returned'} · ${rigLabel(result.data.partition, sources)} · as ranked, level-aligned${result.data.harmonised ? ', reviewer offsets corrected' : ''}`;
	if (result.kind === 'similar')
		series.push({
			id: 'reference',
			label: result.data.reference.productId
				? nameFor(result.data.reference.productId)
				: 'Your local measurement',
			values: result.data.reference.rankCurve,
			reference: true,
			attribution: attribution(result.data.reference.sources)
		});
	else if (result.kind === 'compare')
		for (const [index, reference] of result.data.references.entries())
			series.push({
				id: `reference-${index}`,
				label: nameFor(reference.productId ?? ''),
				values: reference.rankCurve,
				reference: true,
				attribution: attribution(reference.sources)
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
				reference: true,
				attribution: 'Derived taste centre · as ranked; not a new measurement'
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
			attribution: attribution(row.candidate.sources)
		});
	}
	return series;
}

/** Separate alignment coordinate systems without transforming any returned samples. */
export function rankedGroups(
	result: DiscoveryResult,
	overlays: readonly string[],
	nameFor: (id: string) => string
) {
	const series = rankedSeries(result, overlays, nameFor).map((item, styleIndex) => ({ ...item, styleIndex }));
	if (result.kind !== 'compare')
		return [{ id: 'rank', label: 'Frequency response', baselineId: series[0]?.id ?? '', series }];
	return result.data.references.map((reference, index) => {
		const ids = result.data.results
			.filter((row) => row.alignedTo === index && overlays.includes(row.candidate.id))
			.map((row) => row.candidate.id);
		const id = `reference-${index}`;
		return {
			id,
			label: `Aligned to ${nameFor(reference.productId ?? '')}`,
			baselineId: id,
			series: series.filter((item) => item.id === id || ids.includes(item.id))
		};
	});
}
