import type { PreferenceStatement } from '#core/analysis/taste.ts';
import type { Form } from '#core/dataset/types.ts';
import { bandLabels } from './describe.ts';

export function emptyTasteSummary(form: Form): string {
	return `No supported preference description is available against typical ${form === 'iem' ? 'IEMs' : 'headphones'} in this dataset.`;
}

/** Preserve the service's support, direction and measured range while using reader-facing band names. */
export function describeTaste(statement: PreferenceStatement, form: Form): string {
	const product = form === 'iem' ? 'IEM' : 'headphone';
	const [low, high] = statement.magnitudeDb;
	return `Your ${statement.support} liked ${product}${statement.support === 1 ? '' : 's'} ${statement.support === 1 ? 'suggests' : 'suggest'} a preference for ${statement.direction} ${bandLabels[statement.band]} (about ${low.toFixed(1)}–${high.toFixed(1)} dB), compared with typical ${product}s in this dataset.`;
}

const confidenceWording: Record<string, string> = {
	'No sound-related positive ratings; no taste target can be inferred.':
		'Add a sound-related Like or Love to describe your taste.',
	'At least one taste has fewer than three positive examples.':
		'At least one taste is based on fewer than three products you Like or Love.',
	'Positive examples disagree within a taste.':
		'Some products you Like or Love in the same taste have different measured sound.',
	'Some cross-source uncertainty uses the conservative default profile.':
		'Some frequencies use a default uncertainty estimate because measured cross-source statistics are unavailable.',
	'Typical cross-source uncertainty exceeds 2 dB below 8 kHz.':
		'Estimated uncertainty between reviewers is more than 2 dB below 8 kHz.',
	'Insufficient overlapping response data in at least one taste.':
		'At least one taste has too little measurement coverage in common to compare its products.',
	'Some positive and negative inputs conflict.':
		'Some of your liked and disliked products give conflicting sound preferences.',
	'Several agreeing positive examples support each measured taste.':
		'Several products you Like or Love have similar measured sound in each taste.'
};

export function confidenceReason(reason: string): string {
	return confidenceWording[reason] ?? reason;
}
