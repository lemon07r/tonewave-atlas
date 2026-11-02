import { expect, test } from 'vitest';
import { emptyProfile, parseProfile, strength, PROFILE_LIMIT } from './profile.ts';

test('roundtrips separated form factors and excludes neutral strength', () => {
	const data = emptyProfile();
	data.profiles.iem = [
		{ productId: 'known', rating: 'like', strength: 0.6, soundRelated: true, likedAspects: ['bass'] }
	];
	expect(parseProfile(JSON.stringify(data))).toEqual(data);
	expect(
		['love', 'like', 'neutral', 'dislike'].map((r) => strength(r as 'love' | 'like' | 'neutral' | 'dislike'))
	).toEqual([1, 0.6, 0, 1]);
});
test('rejects malformed imports rather than silently discarding their evidence', () => {
	for (const text of [
		'{}',
		'{',
		JSON.stringify({ version: 2, profiles: {} }),
		JSON.stringify({
			version: 1,
			profiles: {
				iem: [
					{ productId: 'a', rating: 'love', strength: 1, soundRelated: true, dislikeReasons: ['invented'] }
				],
				headphone: []
			}
		})
	])
		expect(() => parseProfile(text)).toThrow();
});

test('rejects coercible non-string ratings', () => {
	for (const rating of [['love'], { toString: 'love' }, null, 1]) {
		const data = {
			version: 1,
			profiles: { iem: [{ productId: 'a', rating, strength: 1, soundRelated: true }], headphone: [] }
		};
		expect(() => parseProfile(JSON.stringify(data))).toThrow();
	}
});

test('accepts the editor limit and rejects one additional profile product', () => {
	const data = emptyProfile();
	data.profiles.iem = Array.from({ length: PROFILE_LIMIT }, (_, i) => ({
		productId: `p-${i}`,
		rating: 'love',
		strength: 1,
		soundRelated: true
	}));
	expect(parseProfile(JSON.stringify(data)).profiles.iem).toHaveLength(PROFILE_LIMIT);
	data.profiles.iem.push({ productId: 'extra', rating: 'love', strength: 1, soundRelated: true });
	expect(() => parseProfile(JSON.stringify(data))).toThrow('at most 200');
});
