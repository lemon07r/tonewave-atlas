import { describe, expect, it } from 'vitest';
import { RANK_GRID } from '../grid.ts';
import {
	buildTasteModel,
	correctTaste,
	renderPreference,
	dislikeTrait,
	scoreTasteCandidate,
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
	it('models punch as sub-bass balance, sibilance as narrow energy, and traits without level bias', () => {
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
