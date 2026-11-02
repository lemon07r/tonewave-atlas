import type { Band } from '#core/analysis/common.ts';
import type { BandDistance } from '#core/analysis/distance.ts';
import type { CandidateInfo } from '#core/atlas/types.ts';
import { dateLabel } from '#lib/product/data.ts';

const WORDING = { omit: 0.75, slight: 2, much: 4 } as const;
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
			{
				text: `${magnitude < WORDING.slight ? 'slightly ' : magnitude >= WORDING.much ? 'much ' : ''}${meanDb > 0 ? 'more' : 'less'} ${bandLabels[band]}`,
				lessReliable: band === 'treble' || band === 'air'
			}
		];
	});
	const text = phrases.map((phrase) => phrase.text).join(', ');
	const caveat = phrases.some((phrase) => phrase.lessReliable)
		? ' · differences above 8 kHz are less reliable'
		: '';
	return text
		? text.charAt(0).toUpperCase() + text.slice(1) + caveat
		: 'No band mean differs by 0.75 dB or more where measured.';
}

function roundedRange(range: readonly [number, number]): string {
	const low = range[0].toFixed(1);
	const high = range[1].toFixed(1);
	return low === high ? low : `${low}–${high}`;
}

export function reviewerSummary(range: readonly [number, number] | null, count: number): string {
	const reviewers = `${count} ${count === 1 ? 'reviewer' : 'reviewers'}`;
	return range ? `${roundedRange(range)} dB across ${reviewers}` : reviewers;
}

export function priceLines(candidate: CandidateInfo): string[] {
	return [
		...new Set(
			candidate.prices.flatMap((price) => {
				const source = candidate.sources.find((source) => source.id === price.sourceId);
				if (price.usd === null || !Number.isFinite(price.usd) || !source) return [];
				const month = dateLabel(price.crawledAt);
				return [
					`$${price.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })} listed by ${source.name}, ${month}`
				];
			})
		)
	];
}
