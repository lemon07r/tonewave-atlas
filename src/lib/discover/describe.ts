import type { Band } from '#core/analysis/common.ts';
import type { BandDistance } from '#core/analysis/distance.ts';
import type { CandidateInfo } from '#core/atlas/types.ts';

export const WORDING = { omit: 0.75, slight: 2, much: 4 } as const;
export const bandLabels: Record<Band, string> = {
	'sub-bass': 'sub-bass',
	bass: 'bass',
	'low-mid': 'lower mids',
	mid: 'mids',
	presence: 'presence',
	treble: 'treble',
	air: 'air'
};

/** Signed candidate-minus-reference band means after the engine's level alignment. */
export function describeBands(bands: readonly BandDistance[]): string {
	const phrases = bands.flatMap(({ band, meanDb }) => {
		if (meanDb === null || !Number.isFinite(meanDb) || Math.abs(meanDb) < WORDING.omit) return [];
		const magnitude = Math.abs(meanDb);
		return [
			`${magnitude < WORDING.slight ? 'slightly ' : magnitude >= WORDING.much ? 'much ' : ''}${meanDb > 0 ? 'more' : 'less'} ${bandLabels[band]}${band === 'treble' || band === 'air' ? ' (less reliable above 8 kHz)' : ''}`
		];
	});
	const text = phrases.join(', ');
	return text
		? text[0]!.toUpperCase() + text.slice(1)
		: 'No band mean differs by 0.75 dB or more where measured.';
}

export function priceLines(candidate: CandidateInfo): string[] {
	return [
		...new Set(
			candidate.prices.flatMap((price) => {
				const source = candidate.sources.find((source) => source.id === price.sourceId);
				const date = new Date(price.crawledAt);
				if (price.usd === null || !Number.isFinite(price.usd) || !source || !Number.isFinite(date.getTime()))
					return [];
				const month = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
				return [
					`$${price.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })} listed by ${source.name}, ${month}`
				];
			})
		)
	];
}
