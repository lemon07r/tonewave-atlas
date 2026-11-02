import { expect, test } from 'vitest';
import type { CompareResult, SimilarResult, TasteResult } from '#core/atlas/types.ts';
import { rankedSeries } from './rank-series.ts';
import { nearestLikedEvidence } from './evidence.ts';
import { RANK_GRID } from '#core/grid.ts';
import type { Source } from '#core/dataset/types.ts';

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
test('compare overlays preserve exact returned values aligned to the second reference and omit unaligned curves', () => {
	const second = new Float64Array([NaN, 10, 12]);
	const ranked = new Float64Array([NaN, 11, 11]);
	const result: CompareResult = {
		ok: true,
		partition: 'iem-711',
		harmonised: false,
		sourceMode: 'coverage',
		rankFrequencies: grid,
		rankWeights: new Float64Array([1, 1, 1]),
		treblePenalty: 1,
		references: [new Float64Array([3, NaN, NaN]), second].map((rankCurve, index) => ({
			productId: index ? 'Softears Volume S' : 'First reference',
			uploadId: null,
			measurementIds: [],
			sources: [],
			rankCurve
		})),
		results: [
			{
				candidate,
				rankCurve: ranked,
				offsetDb: 7,
				alignedTo: 1,
				tradeoff: { distances: [null, 1], mean: null, minimax: null, pareto: false }
			}
		],
		counts: { candidates: 1, pareto: 0 },
		caveats: []
	};
	const series = rankedSeries({ kind: 'compare', data: result }, ['match'], (id) => id);
	expect(series[1]?.values).toBe(second);
	expect(series[2]?.values).toBe(ranked);
	expect(Array.from(series[2]?.values ?? [])).toEqual([NaN, 11, 11]);
	expect(series[2]?.label).toContain('aligned to Softears Volume S');
	const row = result.results[0];
	if (!row) throw new Error('Expected compare candidate');
	result.results[0] = { ...row, alignedTo: null, offsetDb: 0 };
	expect(rankedSeries({ kind: 'compare', data: result }, ['match'], (id) => id).map((s) => s.id)).toEqual([
		'reference-0',
		'reference-1'
	]);
});
test('plotted reference and candidate values equal returned rank values, including gaps and offsets', () => {
	const source: Source = {
		id: 'reviewer',
		name: 'Measured by Reviewer',
		url: 'https://reviewer.example/measurements',
		username: 'reviewer',
		dbType: 'squig',
		form: 'iem',
		partition: 'iem-711',
		rig: null,
		rigInferred: true,
		permission: 'public, not explicitly licensed',
		crawledAt: '',
		calibration: null
	};
	const reference = new Float64Array([1, 3, NaN]);
	const ranked = new Float64Array([2, -1, NaN]);
	const result: SimilarResult = {
		ok: true,
		partition: 'iem-711',
		harmonised: true,
		sourceMode: 'coverage',
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
	result.reference.sources = [source];
	result.results[0]?.candidate.sources.push(source);
	for (const item of rankedSeries({ kind: 'similar', data: result }, ['match'], (id) => id)) {
		expect(item.attribution).toContain('Measured by Reviewer https://reviewer.example/measurements');
		expect(item.attribution).toContain('as ranked');
		expect(item.attribution).toContain('reviewer offsets corrected');
	}
});
test('taste overlay uses the centre named by the result tasteId, not the first taste', () => {
	const first = new Float64Array([99, 99, 99]);
	const scored = new Float64Array([1, 2, 3]);
	const result: TasteResult = {
		ok: true,
		partition: 'iem-711',
		harmonised: false,
		sourceMode: 'coverage',
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
		nearestLiked: null,
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
	const near = { id: 'liked-variant', rankCurve: new Float64Array(RANK_GRID.length).fill(10), offsetDb: 3 };
	const row = {
		...selected,
		rankCurve: Float64Array.from(RANK_GRID, (_, i) => (i % 2 ? 14 : 12)),
		nearestLiked: near
	};
	const ranked = {
		...result,
		rankFrequencies: RANK_GRID,
		rankWeights: new Float64Array(RANK_GRID.length).fill(1),
		results: [row]
	};
	expect(nearestLikedEvidence(ranked, row)).toEqual({ id: 'liked-variant', distanceDb: 1 });
	expect(nearestLikedEvidence(ranked, { ...row, nearestLiked: null })).toBeNull();
});
