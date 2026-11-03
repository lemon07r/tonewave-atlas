import { expect, test } from 'vitest';
import { confidenceReason, describeTaste, emptyTasteSummary } from './taste-wording.ts';

test('describes absent preference statements without inventing a cause', () => {
	expect(emptyTasteSummary('iem')).toBe(
		"There isn't enough consistent measurement evidence to describe how your liked products differ from typical IEMs in this dataset."
	);
	expect(emptyTasteSummary('headphone')).toBe(
		"There isn't enough consistent measurement evidence to describe how your liked products differ from typical headphones in this dataset."
	);
});

test('preserves supported measurements and uncertainty without exposing internal band names', () => {
	expect(
		describeTaste({ band: 'low-mid', direction: 'less', magnitudeDb: [1.24, 2.36], support: 3 }, 'iem')
	).toBe(
		'Your 3 liked IEMs suggest a preference for less lower mids (about 1.2–2.4 dB), compared with typical IEMs in this dataset.'
	);
	expect(
		describeTaste({ band: 'bass', direction: 'more', magnitudeDb: [2, 3], support: 2 }, 'headphone')
	).toBe(
		'Your 2 liked headphones suggest a preference for more bass (about 2.0–3.0 dB), compared with typical headphones in this dataset.'
	);
});

test.each([
	[
		'No sound-related positive ratings; no taste target can be inferred.',
		'Add a sound-related Like or Love to describe your taste.'
	],
	[
		'At least one taste has fewer than three positive examples.',
		'At least one taste is based on fewer than three products you Like or Love.'
	],
	[
		'Positive examples disagree within a taste.',
		'Some products you Like or Love in the same taste have different measured sound.'
	],
	[
		'Some cross-source uncertainty uses the conservative default profile.',
		'Some frequencies use a default uncertainty estimate because measured cross-source statistics are unavailable.'
	],
	[
		'Typical cross-source uncertainty exceeds 2 dB below 8 kHz.',
		'Estimated uncertainty between reviewers is more than 2 dB below 8 kHz.'
	],
	[
		'Insufficient overlapping response data in at least one taste.',
		'At least one taste has too little measurement coverage in common to compare its products.'
	],
	[
		'Some positive and negative inputs conflict.',
		'Some of your liked and disliked products give conflicting sound preferences.'
	],
	[
		'Several agreeing positive examples support each measured taste.',
		'Several products you Like or Love have similar measured sound in each taste.'
	]
])('explains the confidence reason "%s" in plain language', (reason, expected) => {
	expect(confidenceReason(reason)).toBe(expected);
});

test('does not hide unfamiliar service evidence', () => {
	expect(confidenceReason('Additional measurement evidence.')).toBe('Additional measurement evidence.');
});
