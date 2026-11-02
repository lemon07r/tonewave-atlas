import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RANK_GRID } from '../grid.ts';
import {
	buildTasteModel,
	correctTaste,
	renderPreference,
	dislikeTrait,
	scoreTasteCandidate,
	rankTastePacked,
	type DislikeReason,
	type RatedItem
} from './taste.ts';
import { responseDistance } from './distance.ts';

function bass(db: number): Float64Array {
	return Float64Array.from(RANK_GRID, (f) => (f < 250 ? db : 0));
}
function item(
	id: string,
	curve: Float64Array,
	rating: RatedItem['rating'] = 'like',
	extra: Partial<RatedItem> = {}
): RatedItem {
	return { id, curve, rating, strength: 1, soundRelated: true, ...extra };
}
const options = {
	spread: new Float64Array(120).fill(1),
	weights: new Float64Array(120).fill(1),
	populationMedian: new Float64Array(120)
};

describe('taste model', () => {
	it('rejects non-finite or negative clustering thresholds rather than merging unrelated likes', () => {
		for (const threshold of [NaN, Infinity, -1])
			expect(() =>
				buildTasteModel([item('a', bass(12)), item('b', bass(-12))], {
					...options,
					clusterThresholdDb: threshold
				})
			).toThrow(RangeError);
	});
	it('clusters similar likes, with an aligned median and agreement-driven summaries', () => {
		const model = buildTasteModel([item('a', bass(4)), item('b', bass(4.5))], options);
		expect(model.tastes).toHaveLength(1);
		expect(model.tastes[0]?.members).toHaveLength(2);
		expect(model.tastes[0]?.summary.some((s) => s.band === 'bass' && s.direction === 'more')).toBe(true);
		const statement = model.tastes[0]?.summary[0];
		if (!statement) throw new Error('missing summary');
		expect(renderPreference(statement)).toContain('relative to the typical IEM in this dataset');
		expect(model.confidence.level).toBe('limited');
	});
	it('keeps dissimilar likes as two tastes, never a blended centre', () => {
		const a = bass(12),
			b = bass(-12),
			model = buildTasteModel([item('a', a), item('b', b)], options);
		expect(model.tastes).toHaveLength(2);
		expect(responseDistance(model.tastes[0]?.centre ?? [], a)?.distance).toBeCloseTo(0, 12);
		expect(responseDistance(model.tastes[1]?.centre ?? [], b)?.distance).toBeCloseTo(0, 12);
		expect(scoreTasteCandidate(a, model)?.score).toBeCloseTo(0, 12);
	});
	it('uses average linkage rather than chaining a succession of neighbouring likes', () => {
		const model = buildTasteModel([item('a', bass(0)), item('b', bass(5)), item('c', bass(10))], options);
		expect(model.tastes).toHaveLength(2);
		expect(model.tastes.map((t) => t.members.length).sort()).toEqual([1, 2]);
	});
	it('uses rating strength in the aligned median rather than averaging likes', () => {
		const loved = bass(5),
			model = buildTasteModel([item('a', bass(0)), item('b', loved, 'love')], options);
		expect(model.tastes).toHaveLength(1);
		expect(responseDistance(model.tastes[0]?.centre ?? [], loved)?.distance).toBeCloseTo(0, 10);
	});
	it('a bassy dislike does not reward bass-less over moderate candidates', () => {
		const model = buildTasteModel(
			[item('like', bass(3)), item('bad', bass(8), 'dislike', { dislikeReasons: ['too-much-bass'] })],
			options
		);
		const moderate = scoreTasteCandidate(bass(3), model),
			bassless = scoreTasteCandidate(bass(-5), model),
			worse = scoreTasteCandidate(bass(12), model);
		expect(moderate?.penalty).toBe(0);
		expect(bassless?.penalty).toBe(0);
		expect(moderate?.score).toBeLessThan(bassless?.score ?? 0);
		expect(worse?.penalty).toBeGreaterThan(0);
		expect(worse?.constraints[0]?.status).toBe('violated');
	});
	it('fit-only dislikes and zero-strength ratings have no FR effect', () => {
		const liked = item('good', bass(3));
		const a = buildTasteModel([liked], options),
			b = buildTasteModel(
				[
					liked,
					item('fit', bass(3), 'dislike', { soundRelated: false }),
					item('zero', bass(3), 'dislike', { strength: 0 })
				],
				options
			);
		expect(scoreTasteCandidate(bass(3), a)).toEqual(scoreTasteCandidate(bass(3), b));
		expect(b.dislikes).toEqual([]);
	});
	it('adds the documented soft-constraint score increments and scales them by strength', () => {
		for (const strength of [1, 0.5]) {
			const model = buildTasteModel(
				[
					item('good', bass(0)),
					item('bad', bass(8), 'dislike', { dislikeReasons: ['too-much-bass'], strength })
				],
				options
			);
			// Independently evaluated shifted-softplus values at z=1,2,4 dB beyond the margin.
			for (const [z, expected] of [
				[1, 0.5139318674651498],
				[2, 2.763910817484336],
				[4, 13.348749941864854]
			]) {
				expect(scoreTasteCandidate(bass(8.5 + (z ?? 0)), model)?.penalty).toBeCloseTo(
					(expected ?? 0) * strength,
					10
				);
			}
		}
	});
	it('unreasoned dislike repels near duplicates only, and reports conflicts', () => {
		const model = buildTasteModel([item('good', bass(3)), item('bad', bass(3), 'dislike')], options);
		expect(model.conflicts).toContainEqual(expect.objectContaining({ kind: 'near-liked-dislike' }));
		expect(scoreTasteCandidate(bass(3), model)?.penalty).toBe(1);
		expect(scoreTasteCandidate(bass(-10), model)?.penalty).toBeLessThan(1e-5);
		const contrary = buildTasteModel(
			[item('good', bass(12)), item('bad', bass(8), 'dislike', { dislikeReasons: ['too-much-bass'] })],
			options
		);
		expect(contrary.conflicts).toContainEqual(
			expect.objectContaining({ kind: 'reason-contradicts-like', reason: 'too-much-bass' })
		);
	});
	it('corrections copy the centre without altering measured evidence or the input model', () => {
		const model = buildTasteModel([item('good', bass(0))], options),
			corrected = correctTaste(model, 0, { bass: 3 });
		expect(model.tastes[0]?.centre[24]).toBe(0);
		expect(corrected.tastes[0]?.centre[24]).toBe(3);
		expect(corrected.tastes[0]?.tolerance).toBe(model.tastes[0]?.tolerance);
	});
	it('reports nearest liked item, uncertain bands, and no invented target without positives', () => {
		const model = buildTasteModel([item('good', bass(0))]);
		const score = scoreTasteCandidate(bass(1), model);
		expect(score?.nearestLiked?.id).toBe('good');
		expect(score?.uncertainRegions.some((r) => r.low === 8000)).toBe(true);
		expect(scoreTasteCandidate(bass(0), buildTasteModel([item('bad', bass(0), 'dislike')]))).toBeNull();
	});
	it('models the legacy balance id as sub-bass balance, sibilance as bounded narrow RMS, and traits without level bias', () => {
		const dull = bass(0),
			punch = Float64Array.from(RANK_GRID, (f) => (f < 60 ? 5 : 0));
		expect(dislikeTrait(punch, 'bass-lacks-punch')?.value).toBe(5);
		expect(dislikeTrait(dull, 'bass-lacks-punch')?.value).toBe(0);
		const spiky = bass(0);
		spiky[101] = 10;
		expect(dislikeTrait(spiky, 'sibilance')?.value).toBeGreaterThan(0);
		expect(dislikeTrait(new Float64Array(120).fill(10), 'sibilance')?.value).toBeCloseTo(0, 10);
		for (const reason of [
			'too-much-bass',
			'too-little-bass',
			'muddy-lower-mids',
			'thin-or-recessed-vocals',
			'shouty-upper-mids',
			'sharp-fatiguing-treble',
			'dull-treble'
		] as const) {
			expect(
				dislikeTrait(
					Float64Array.from(punch, (v) => v + 70),
					reason
				)?.value
			).toBeCloseTo(dislikeTrait(punch, reason)?.value ?? NaN, 10);
		}
	});
	it('widens a singleton prior and disagreement while reserving strong confidence for support', () => {
		const single = buildTasteModel([item('a', bass(3))], options),
			agree = buildTasteModel([item('a', bass(3)), item('b', bass(3))], options);
		expect(single.tastes[0]?.tolerance[24]).toBeGreaterThan(agree.tastes[0]?.tolerance[24] ?? Infinity);
		const disagree = buildTasteModel([item('a', bass(0)), item('b', bass(3))], options);
		expect(disagree.tastes[0]?.tolerance[24]).toBeGreaterThan(agree.tastes[0]?.tolerance[24] ?? Infinity);
		const strong = buildTasteModel(
			Array.from({ length: 5 }, (_, i) => item(String(i), bass(3))),
			options
		);
		expect(strong.confidence.level).toBe('strong');
		const fallback = buildTasteModel(
			Array.from({ length: 5 }, (_, i) => item(String(i), bass(3))),
			{ ...options, spread: new Float64Array(120).fill(NaN) }
		);
		expect(fallback.confidence.level).toBe('moderate');
		const uncertain = buildTasteModel(
			Array.from({ length: 5 }, (_, i) => item(String(i), bass(3))),
			{ ...options, spread: new Float64Array(120).fill(4) }
		);
		expect(uncertain.confidence.level).toBe('limited');
	});
});

describe('packed two-stage taste ranking', () => {
	it('matches exhaustive explanations on randomised curves, all reasons, missing data and corrected tastes', () => {
		const reasons: DislikeReason[] = [
			'too-much-bass',
			'too-little-bass',
			'bass-lacks-punch',
			'too-much-midbass-warmth',
			'muddy-lower-mids',
			'thin-or-recessed-vocals',
			'shouty-upper-mids',
			'sharp-fatiguing-treble',
			'sibilance',
			'dull-treble',
			'tonal-balance-wrong',
			'other'
		];
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 1000000 }), fc.integer({ min: 1, max: 40 }), (seed, topK) => {
				let state = seed;
				const random = () => {
					state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
					return state / 2 ** 32;
				};
				const n = 140,
					matrix = new Float32Array(n * 120);
				for (let row = 0; row < n; row++) {
					const bassGain = random() * 30 - 15,
						phase = random() * 6,
						gain = random() * 12 - 6,
						level = random() * 100;
					for (let i = 0; i < 120; i++)
						matrix[row * 120 + i] =
							random() < 0.13
								? NaN
								: level +
									((RANK_GRID[i] ?? 0) < 250 ? bassGain : 0) +
									Math.sin(i / 9 + phase) * gain +
									random() * 4;
				}
				// Entirely absent rows, <50% overlap, and an exact duplicate exercise rejection and ties.
				matrix.fill(NaN, 137 * 120);
				matrix.set(matrix.subarray(0, 120), 136 * 120);
				matrix.fill(NaN, 135 * 120 + 40, 136 * 120);
				const curves = Array.from({ length: n }, (_, i) => matrix.subarray(i * 120, (i + 1) * 120));
				const ratings = [0, 1, 2].map((i) => item(String(i), Float64Array.from(curves[i] ?? [])));
				for (let i = 0; i < reasons.length; i++)
					ratings.push(
						item(`bad-${i}`, Float64Array.from(curves[i + 3] ?? []), 'dislike', {
							dislikeReasons: [reasons[i] ?? 'other'],
							strength: 0.2 + random() * 0.8
						})
					);
				ratings.push(item('unreasoned', Float64Array.from(curves[20] ?? []), 'dislike'));
				const weights = Float64Array.from({ length: 120 }, (_, i) => (i % 11 === 0 ? 0 : 0.1 + random() * 2));
				let model = buildTasteModel(ratings, { ...options, weights, clusterThresholdDb: 0.1 });
				expect(model.tastes.length).toBeGreaterThan(1);
				model = correctTaste(model, 0, { bass: seed % 3 });
				const expected = curves
					.flatMap((curve, index) => {
						const fit = scoreTasteCandidate(curve, model);
						return fit ? [{ index, fit }] : [];
					})
					.sort((a, b) => a.fit.score - b.fit.score || a.index - b.index)
					.slice(0, topK);
				expect(rankTastePacked(matrix, model, topK)).toEqual(expected);
			}),
			{ numRuns: 12 }
		);
	});
	it('keeps input-order ties, handles empty rankings, and rejects malformed packs', () => {
		const model = buildTasteModel([item('a', bass(0))], options),
			matrix = new Float32Array(120 * 40);
		expect(rankTastePacked(matrix, model, 5).map((r) => r.index)).toEqual([0, 1, 2, 3, 4]);
		expect(rankTastePacked(matrix, model, 0)).toEqual([]);
		expect(rankTastePacked(new Float32Array(), model)).toEqual([]);
		expect(rankTastePacked(matrix, buildTasteModel([item('bad', bass(0), 'dislike')]))).toEqual([]);
		expect(() => rankTastePacked(new Float32Array(121), model)).toThrow(RangeError);
		expect(() => rankTastePacked(matrix, model, -1)).toThrow(RangeError);
	});
});
