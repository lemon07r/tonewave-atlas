/** Pure taste modelling/ranking after reference loading, separate from AtlasService IO and caches. */
import { distanceSummary } from '../analysis/distance.ts';
import {
	buildTasteModel,
	correctTaste,
	rankTastePacked,
	renderPreference,
	type RatedItem
} from '../analysis/taste.ts';
import type { Form } from '../dataset/types.ts';
import { RANK_GRID, RANK_SIZE } from '../grid.ts';
import type { PartitionIndex } from './index.ts';
import {
	alignedCurve,
	distanceOptions,
	rankingCaveats,
	selection,
	sourceMode,
	statisticCurve,
	topK
} from './ranking.ts';
import type { TasteRequest, TasteResult, UnusedTasteItem } from './types.ts';

export function tasteRanking(
	index: PartitionIndex,
	items: RatedItem[],
	unusedItems: UnusedTasteItem[],
	request: TasteRequest,
	form: Form
): TasteResult {
	const references = request.items.map((i) => i.productId);
	const common = {
		ok: true as const,
		partition: index.partition.id,
		harmonised: index.harmonised,
		sourceMode: sourceMode(request.filters),
		rankFrequencies: RANK_GRID.slice(),
		unusedItems
	};
	if (!items.length)
		return {
			...common,
			rankWeights: distanceOptions(index).weights,
			model: {
				tastes: [],
				confidence: { level: 'limited', reasons: ['No usable sound-related ratings on this rig.'] },
				conflicts: []
			},
			results: [],
			caveats: rankingCaveats(index, references)
		};
	let model = buildTasteModel(items, {
		frequencies: RANK_GRID,
		...(index.statistics
			? {
					spread: statisticCurve(index.statistics.spread),
					populationMedian: statisticCurve(index.statistics.populationMedian)
				}
			: {})
	});
	for (const correction of request.corrections ?? [])
		model = correctTaste(model, correction.tasteId, correction.bands);
	const selected = selection(index, request.filters, new Set(references));
	const matches = rankTastePacked(selected.matrix, model, topK(request.topK));
	const members = new Map(model.tastes.flatMap((t) => t.members).map((member) => [member.id, member]));
	return {
		...common,
		rankWeights: model.weights.slice(),
		model: {
			tastes: model.tastes.map((t) => ({
				id: t.id,
				members: t.members.map((m) => m.id),
				centre: t.centre.slice(),
				fitWeights: t.weights.slice(),
				summary: t.summary,
				statements: t.summary.map((s) => renderPreference(s, form === 'iem' ? 'IEM' : 'headphone'))
			})),
			confidence: model.confidence,
			conflicts: model.conflicts
		},
		results: matches.flatMap((m) => {
			const candidate = selected.candidates[m.index],
				taste = model.tastes.find((t) => t.id === m.fit.taste);
			if (!candidate || !taste) return [];
			const values = selected.matrix.subarray(m.index * RANK_SIZE, (m.index + 1) * RANK_SIZE);
			const distance = distanceSummary(values, taste.centre, {
				frequencies: RANK_GRID,
				weights: model.weights
			});
			if (!distance) return [];
			const liked = m.fit.nearestLiked ? members.get(m.fit.nearestLiked.id) : undefined;
			const nearest = liked
				? distanceSummary(values, liked.curve, { frequencies: RANK_GRID, weights: model.weights })
				: null;
			return [
				{
					candidate: candidate.info,
					fit: m.fit,
					tasteId: taste.id,
					rankCurve: alignedCurve(values, distance.offset),
					offsetDb: distance.offset,
					nearestLiked:
						liked && nearest
							? {
									id: liked.id,
									rankCurve: Float64Array.from(liked.curve),
									offsetDb: nearest.offset - distance.offset
								}
							: null
				}
			];
		}),
		caveats: rankingCaveats(
			index,
			references,
			selected.candidates.map((c) => c.info.product.id)
		)
	};
}
