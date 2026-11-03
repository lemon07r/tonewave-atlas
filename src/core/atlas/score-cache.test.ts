import { expect, it, vi } from 'vitest';
import { ScoreCache, scoringKey } from './score-cache.ts';

it('keeps only the last scoring computation and shares concurrent callers', async () => {
	const cache = new ScoreCache<number>();
	const compute = vi.fn(() => Promise.resolve(1));
	const first = cache.get('a', compute);
	expect(cache.get('a', compute)).toBe(first);
	expect(await first).toBe(1);
	expect(compute).toHaveBeenCalledTimes(1);
	await cache.get('b', compute);
	await cache.get('a', compute);
	expect(compute).toHaveBeenCalledTimes(3);
});

it('does not cache rejected scoring computations', async () => {
	const cache = new ScoreCache<number>();
	await expect(cache.get('a', () => Promise.reject(new Error('fetch failed')))).rejects.toThrow(
		'fetch failed'
	);
	expect(await cache.get('a', () => Promise.resolve(2))).toBe(2);
});

it('excludes view controls only and canonicalises object property order', () => {
	const base = {
		references: [{ productId: 'a', measurementId: 'a1' }, { productId: 'b' }],
		partition: 'iem-711',
		filters: { sourceMode: 'only', sources: ['s1'], minReviewers: 2 },
		customBands: { bass: 2, treble: 3 },
		focus: 'bass',
		treblePenalty: 2,
		harmonise: false
	};
	const key = scoringKey('v1', base);
	expect(scoringKey('v1', { ...base, sort: 'minimax', paretoOnly: true, topK: 100 })).toBe(key);
	expect(
		scoringKey('v1', {
			...base,
			customBands: { treble: 3, bass: 2 },
			filters: { minReviewers: 2, sources: ['s1'], sourceMode: 'only' }
		})
	).toBe(key);
	for (const change of [
		{ references: [...base.references].reverse() },
		{ references: [{ productId: 'a', measurementId: 'a2' }, { productId: 'b' }] },
		{ partition: 'iem-5128' },
		{ focus: 'treble' },
		{ treblePenalty: 3 },
		{ harmonise: true },
		{ customBands: { bass: 3, treble: 3 } },
		...[
			{ sourceMode: 'coverage' },
			{ sources: ['s2'] },
			{ includeModified: true },
			{ includeTunings: true },
			{ minReviewers: 3 },
			{ minPriceUsd: 1 },
			{ maxPriceUsd: 20 }
		].map((filters) => ({ filters: { ...base.filters, ...filters } })),
		{ corrections: [{ tasteId: 0, bands: { bass: 1 } }] },
		{ items: [{ productId: 'a', rating: 'like', strength: 1 }] },
		{ uploadId: 'another-upload' }
	])
		expect(scoringKey('v1', { ...base, ...change })).not.toBe(key);
	expect(scoringKey('v2', base)).not.toBe(key);
	expect(scoringKey('v1', { ...base, treblePenalty: NaN })).not.toBe(
		scoringKey('v1', { ...base, treblePenalty: null })
	);
});
