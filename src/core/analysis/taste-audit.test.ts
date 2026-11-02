import { describe, expect, it } from 'vitest';
import { RANK_GRID } from '../grid.ts';
import {
	buildTasteModel,
	dislikeTrait,
	DISLIKE_REASON_LABELS,
	rankTastePacked,
	scoreTasteCandidate,
	type RatedItem
} from './taste.ts';

const flat = new Float64Array(120);
const bass = (gain: number) => Float64Array.from(RANK_GRID, (f) => (f < 250 ? gain : 0));
const rating = (id: string, curve: Float64Array, extra: Partial<RatedItem> = {}): RatedItem => ({
	id,
	curve,
	rating: 'like',
	strength: 1,
	soundRelated: true,
	...extra
});
const options = { spread: new Float64Array(120).fill(1), weights: new Float64Array(120).fill(1) };

describe('taste heuristic audit', () => {
	it('keeps the legacy balance id but labels measured 20–60 versus 80–250 Hz levels and penalises the independently specified lower direction', () => {
		expect(DISLIKE_REASON_LABELS['bass-lacks-punch']).toBe('Lower 20–60 Hz level relative to 80–250 Hz');
		const balance = (sub: number, mid: number) =>
			Float64Array.from(RANK_GRID, (f) => (f < 60 ? sub : f >= 80 && f < 250 ? mid : 0));
		const model = buildTasteModel(
			[
				rating('like', flat),
				rating('reference', balance(3, 1), { rating: 'dislike', dislikeReasons: ['bass-lacks-punch'] })
			],
			options
		);
		expect(dislikeTrait(balance(3, 1), 'bass-lacks-punch')?.value).toBe(2);
		expect(dislikeTrait(balance(1, 3), 'bass-lacks-punch')?.value).toBe(-2);
		expect(scoreTasteCandidate(balance(5, 1), model)?.penalty).toBe(0);
		expect(scoreTasteCandidate(balance(1, 3), model)?.penalty).toBeGreaterThan(0);
	});
	it('bounds a single exact 9 kHz spike without top-five-to-bottom collapse while broad 5–9 kHz excess still counts', () => {
		// Uniform log grid with an exact 9 kHz bin, avoiding any uncertainty about the endpoint test.
		const frequencies = Float64Array.from({ length: 120 }, (_, i) => 9000 * 2 ** ((i - 105) / 12));
		const spike = flat.slice();
		spike[105] = 30;
		const base = buildTasteModel([rating('like', flat)], { frequencies });
		const model = buildTasteModel(
			[rating('like', flat), rating('reference', flat, { rating: 'dislike', dislikeReasons: ['sibilance'] })],
			{ frequencies }
		);
		const n = Array.from(frequencies).filter((f) => f >= 5000 && f <= 9000).length;
		// Only the spike has a positive residual; its clipped amplitude is exactly 2 dB.
		expect(dislikeTrait(spike, 'sibilance', frequencies)?.value).toBeCloseTo(2 / Math.sqrt(n), 12);
		const candidates = [
			spike,
			...Array.from({ length: 30 }, (_, i) => Float64Array.from(frequencies, (f) => (f < 250 ? i + 1 : 0)))
		];
		const matrix = new Float32Array(candidates.flatMap((c) => Array.from(c)));
		expect(rankTastePacked(matrix, base, 5).map((r) => r.index)).toContain(0);
		expect(rankTastePacked(matrix, model, 5).map((r) => r.index)).toContain(0);
		expect(scoreTasteCandidate(spike, model)?.penalty).toBeLessThanOrEqual(0.5);
		const broad = Float64Array.from(frequencies, (f) => (f >= 5000 && f <= 9000 ? 8 : 0));
		expect(scoreTasteCandidate(broad, model)?.penalty).toBeGreaterThan(0);
		expect(scoreTasteCandidate(broad, model)?.plainDistanceDb).toBeGreaterThan(0);
		const repeated = buildTasteModel(
			[
				rating('like', flat),
				...Array.from({ length: 20 }, (_, i) =>
					rating(`bad-${i}`, flat, { rating: 'dislike', dislikeReasons: ['sibilance'] })
				)
			],
			{ frequencies }
		);
		expect(scoreTasteCandidate(broad, repeated)?.penalty).toBeLessThanOrEqual(0.5);
	});
	it('produces measured-correlate wording for every legacy dislike id, including missing-band and near-duplicate explanations', () => {
		for (const reason of Object.keys(DISLIKE_REASON_LABELS) as (keyof typeof DISLIKE_REASON_LABELS)[]) {
			const model = buildTasteModel(
				[rating('like', flat), rating('reference', bass(1), { rating: 'dislike', dislikeReasons: [reason] })],
				options
			);
			const fit = scoreTasteCandidate(bass(3), model);
			expect(fit?.constraints[0]?.statement).toMatch(/measured|Measured/);
			expect(fit?.constraints[0]?.statement).not.toMatch(
				/punch|sibilance|shout|fatigu|muddy|dull|recessed|warmth/
			);
		}
	});
	it('has a nonnegative monotone safe-side plateau and linear strength scaling, but the dB/penalty mixture is not scale homogeneous', () => {
		const make = (strength: number) =>
			buildTasteModel(
				[
					rating('like', flat),
					rating('reference', bass(2), { rating: 'dislike', strength, dislikeReasons: ['too-much-bass'] })
				],
				options
			);
		const model = make(1),
			half = make(0.5);
		let previous = 0;
		for (const gain of [-10, -1, 0, 2, 2.5, 3, 5, 8]) {
			const penalty = scoreTasteCandidate(bass(gain), model)?.penalty ?? NaN;
			expect(penalty).toBeGreaterThanOrEqual(previous);
			if (gain <= 2.5) expect(penalty).toBe(0);
			expect(scoreTasteCandidate(bass(gain), half)?.penalty).toBeCloseTo(penalty / 2, 12);
			previous = penalty;
		}
		const scores = (scale: number) => {
			const m = buildTasteModel(
				[
					rating('like', flat),
					rating('reference', bass(2 * scale), { rating: 'dislike', dislikeReasons: ['too-much-bass'] })
				],
				options
			);
			return [scoreTasteCandidate(bass(4 * scale), m), scoreTasteCandidate(bass(-5 * scale), m)];
		};
		const small = scores(0.1),
			large = scores(4);
		expect(small[0]?.score).toBeLessThan(small[1]?.score ?? NaN);
		expect(large[0]?.score).toBeGreaterThan(large[1]?.score ?? NaN);
		expect(large[0]?.fit).toBeCloseTo(40 * (small[0]?.fit ?? NaN), 12);
	});
	it('is invariant to arbitrary per-measurement level shifts and reports missing bands unknown, not safe or zero error', () => {
		const original = [
			rating('like', bass(1)),
			rating('reference', bass(2), { rating: 'dislike', dislikeReasons: ['too-much-bass'] })
		];
		const a = buildTasteModel(original, options),
			b = buildTasteModel(
				original.map((r, i) => ({ ...r, curve: Float64Array.from(r.curve, (v) => v + 70 + i * 13) })),
				options
			);
		expect(scoreTasteCandidate(bass(6), a)?.score).toBeCloseTo(
			scoreTasteCandidate(
				Float64Array.from(bass(6), (v) => v - 37),
				b
			)?.score ?? NaN,
			12
		);
		const missing = Float64Array.from(RANK_GRID, (f) => (f < 250 ? NaN : 0));
		for (const missingReference of [false, true]) {
			const model = buildTasteModel(
				[
					rating('like', flat),
					rating('reference', missingReference ? missing : bass(2), {
						rating: 'dislike',
						dislikeReasons: ['too-much-bass']
					})
				],
				options
			);
			const fit = scoreTasteCandidate(missingReference ? bass(6) : missing, model);
			expect(fit?.constraints[0]?.status).toBe('unknown');
			expect(fit?.penalty).toBe(0);
			expect(fit?.constraints[0]?.statement).toContain('Insufficient measured coverage');
		}
	});
	it('keeps small positive sets limited and retains conflicting separated tastes without blending away the conflict', () => {
		for (const count of [1, 2])
			expect(
				buildTasteModel(
					Array.from({ length: count }, (_, i) => rating(String(i), flat)),
					options
				).confidence.level
			).toBe('limited');
		const model = buildTasteModel(
			[
				rating('low', bass(-12)),
				rating('high', bass(12)),
				rating('reference', bass(8), { rating: 'dislike', dislikeReasons: ['too-much-bass'] })
			],
			options
		);
		expect(model.tastes).toHaveLength(2);
		expect(model.conflicts).toContainEqual(
			expect.objectContaining({ kind: 'reason-contradicts-like', liked: 'high' })
		);
		expect(model.confidence.level).toBe('limited');
		expect(scoreTasteCandidate(bass(-12), model)?.fit).toBeCloseTo(0, 12);
		expect(scoreTasteCandidate(bass(12), model)?.fit).toBeCloseTo(0, 12);
		expect(scoreTasteCandidate(bass(12), model)?.penalty).toBeGreaterThan(0);
	});
});
