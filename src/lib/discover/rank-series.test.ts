import { expect, test } from 'vitest';
import type { SimilarResult, TasteResult } from '#core/atlas/types.ts';
import { rankedSeries } from './rank-series.ts';

const candidate = {
	id: 'match',
	product: { id: 'p', brand: 'Brand', model: 'Model', form: 'iem' as const },
	kind: 'default' as const,
	variantLabel: null,
	measurementIds: [],
	sources: [],
	prices: [],
	priceUsd: null
};
const grid = new Float64Array([20, 40, 80]);
test('plotted reference and candidate values equal returned rank values, including gaps and offsets', () => {
	const reference = new Float64Array([1, 3, NaN]);
	const ranked = new Float64Array([2, -1, NaN]);
	const result: SimilarResult = {
		ok: true,
		partition: 'iem-711',
		harmonised: true,
		rankFrequencies: grid,
		rankWeights: new Float64Array([1, 1, 0]),
		treblePenalty: 2,
		reference: { productId: 'ref', uploadId: null, measurementIds: [], sources: [], rankCurve: reference },
		results: [
			{
				candidate,
				rankCurve: ranked,
				offsetDb: 8,
				distance: 2,
				offset: 8,
				bands: [],
				tilt: 0,
				coverage: 1,
				points: 2,
				perSourceRange: null,
				sourceCount: 1,
				sameProduct: false
			}
		],
		caveats: []
	};
	const series = rankedSeries({ kind: 'similar', data: result }, ['match'], (id) => id);
	expect(series[0]?.values).toBe(reference);
	expect(series[1]?.values).toBe(ranked);
	expect(Array.from(series[1]?.values ?? [])).toEqual([2, -1, NaN]);
});
test('taste overlay uses the centre named by the result tasteId, not the first taste', () => {
	const first = new Float64Array([99, 99, 99]);
	const scored = new Float64Array([1, 2, 3]);
	const result: TasteResult = {
		ok: true,
		partition: 'iem-711',
		harmonised: false,
		rankFrequencies: grid,
		rankWeights: new Float64Array([1, 1, 1]),
		model: {
			tastes: [
				{ id: 0, centre: first, members: [], fitWeights: grid, summary: [], statements: [] },
				{ id: 1, centre: scored, members: [], fitWeights: grid, summary: [], statements: [] }
			],
			confidence: { level: 'limited', reasons: [] },
			conflicts: []
		},
		results: [],
		unusedItems: [],
		caveats: []
	};
	const selected = {
		candidate,
		tasteId: 1,
		rankCurve: scored,
		offsetDb: 0,
		fit: {
			score: 1,
			taste: 1,
			fit: 1,
			plainDistanceDb: 1,
			penalty: 0,
			nearestLiked: null,
			constraints: [],
			bands: [],
			uncertainRegions: []
		}
	};
	const series = rankedSeries(
		{ kind: 'taste', data: { ...result, results: [selected] } },
		['match'],
		(id) => id
	);
	expect(series[0]?.id).toBe('taste-1');
	expect(series[0]?.values).toBe(scored);
	expect(series[1]?.values).toBe(scored);
});
