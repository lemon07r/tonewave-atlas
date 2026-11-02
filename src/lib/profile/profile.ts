import type { TasteItem } from '#core/atlas/types.ts';
import type { DislikeReason, RatedItem } from '#core/analysis/taste.ts';
import type { Form } from '#core/dataset/types.ts';

export const PROFILE_KEY = 'tonewave.profile.v1';
export const PROFILE_LIMIT = 200;
export const reasonLabels: Record<DislikeReason, string> = {
	'too-much-bass': 'Too much bass',
	'too-little-bass': 'Too little bass',
	'bass-lacks-punch': 'Bass lacks punch',
	'too-much-midbass-warmth': 'Too much mid-bass warmth',
	'muddy-lower-mids': 'Muddy lower mids',
	'thin-or-recessed-vocals': 'Thin or recessed vocals',
	'shouty-upper-mids': 'Shouty upper mids',
	'sharp-fatiguing-treble': 'Sharp or fatiguing treble',
	sibilance: 'Sibilance',
	'dull-treble': 'Dull treble',
	'tonal-balance-wrong': 'Tonal balance just wrong',
	other: 'Other'
};
export const aspectLabels = {
	bass: 'Bass',
	mids: 'Mids',
	treble: 'Treble',
	overall: 'Overall balance'
} as const;
export type Profile = { version: 1; profiles: Record<Form, TasteItem[]> };
export const emptyProfile = (): Profile => ({ version: 1, profiles: { iem: [], headphone: [] } });
export function strength(rating: RatedItem['rating']): number {
	return rating === 'like' ? 0.6 : rating === 'neutral' ? 0 : 1;
}
const record = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string =>
	typeof value === 'string' && value.length > 0 && value.length <= 300;

/** Strict, bounded import. Reconstructs known fields; never trusts stored strengths or object keys. */
export function parseProfile(text: string): Profile {
	if (text.length > 1_000_000) throw new Error('Profile file is too large (maximum 1 MB).');
	const data: unknown = JSON.parse(text);
	if (!record(data) || data.version !== 1 || !record(data.profiles))
		throw new Error('Expected a Tonewave version 1 profile with both form factors.');
	const result = emptyProfile();
	for (const form of ['iem', 'headphone'] as const) {
		const items = data.profiles[form];
		if (!Array.isArray(items) || items.length > PROFILE_LIMIT)
			throw new Error(`Each form factor must contain at most ${PROFILE_LIMIT} profile products.`);
		const seen = new Set<string>();
		for (const item of items as unknown[]) {
			if (
				!record(item) ||
				!id(item.productId) ||
				seen.has(item.productId) ||
				typeof item.rating !== 'string' ||
				!['love', 'like', 'neutral', 'dislike'].includes(item.rating) ||
				typeof item.soundRelated !== 'boolean'
			)
				throw new Error('Invalid or duplicate profile product, rating or sound-related flag.');
			const rating = item.rating as TasteItem['rating'];
			if (item.strength !== strength(rating)) throw new Error('Invalid strength for this rating.');
			if (item.measurementId !== undefined && !id(item.measurementId))
				throw new Error('Invalid measurement ID.');
			if (
				item.dislikeReasons !== undefined &&
				(!Array.isArray(item.dislikeReasons) ||
					!item.dislikeReasons.every((r: unknown) => typeof r === 'string' && Object.hasOwn(reasonLabels, r)))
			)
				throw new Error('Unknown dislike reason.');
			if (
				item.likedAspects !== undefined &&
				(!Array.isArray(item.likedAspects) ||
					!item.likedAspects.every((r: unknown) => typeof r === 'string' && Object.hasOwn(aspectLabels, r)))
			)
				throw new Error('Unknown liked aspect.');
			seen.add(item.productId);
			result.profiles[form].push({
				productId: item.productId,
				rating,
				strength: strength(rating),
				soundRelated: item.soundRelated,
				...(typeof item.measurementId === 'string' ? { measurementId: item.measurementId } : {}),
				...(Array.isArray(item.dislikeReasons)
					? { dislikeReasons: [...new Set(item.dislikeReasons)] as DislikeReason[] }
					: {}),
				...(Array.isArray(item.likedAspects)
					? { likedAspects: [...new Set(item.likedAspects)] as NonNullable<TasteItem['likedAspects']> }
					: {})
			});
		}
	}
	return result;
}
