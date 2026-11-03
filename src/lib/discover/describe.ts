import type { Band } from '#core/analysis/common.ts';
import type { BandDistance } from '#core/analysis/distance.ts';
import type { CandidateInfo } from '#core/atlas/types.ts';
import { priceListings } from '#lib/product/data.ts';

const WORDING = { omit: 0.75, slight: 2, much: 4 } as const;
/** Missing alternatives were not searched; an explicit empty list means none cover the set. */
export function rigFailureMessage(partitions: readonly string[] | undefined): string {
	if (partitions === undefined)
		return 'This reference isn’t measured on the selected rig. Try automatic rig.';
	return partitions.length
		? 'This rig doesn’t cover every reference. Choose a rig below.'
		: 'No rig covers every reference. Change a reference or variant.';
}
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
	const phrases = [...bands]
		.sort((a, b) => b.contribution - a.contribution || Math.abs(b.meanDb ?? 0) - Math.abs(a.meanDb ?? 0))
		.flatMap(({ band, meanDb }) => {
			if (meanDb === null || !Number.isFinite(meanDb) || Math.abs(meanDb) < WORDING.omit) return [];
			const magnitude = Math.abs(meanDb);
			return [
				{
					text: `${magnitude < WORDING.slight ? 'slightly ' : magnitude >= WORDING.much ? 'much ' : ''}${meanDb > 0 ? 'more' : 'less'} ${bandLabels[band]}`,
					lessReliable: band === 'treble' || band === 'air'
				}
			];
		})
		.slice(0, 2);
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

export function reviewerSummary(
	range: readonly [number, number] | null,
	count: number,
	rangeSourceCount = count
): string {
	const reviewers = `${count} ${count === 1 ? 'reviewer' : 'reviewers'}`;
	const coverage = rangeSourceCount < count ? `${rangeSourceCount} of them` : 'reviewers';
	return `Measured by ${reviewers}${range && count > 1 ? ` · ${roundedRange(range)} dB to the reference across ${coverage}` : ''}`;
}

export function priceLines(candidate: CandidateInfo, now = Date.now()): string[] {
	return priceListings(candidate.prices, candidate.sources, now);
}

export function distanceExtremes(distances: readonly (number | null)[]): string[] {
	// Match the one-decimal precision displayed by dbLabel in the distance cells.
	const rounded = distances.map((value) =>
		value === null || !Number.isFinite(value) ? null : Number(value.toFixed(1))
	);
	const finite = rounded.filter((value): value is number => value !== null);
	const closest = Math.min(...finite),
		furthest = Math.max(...finite);
	return rounded.map((value) =>
		value === null
			? 'No coverage'
			: closest === furthest
				? ''
				: value === closest
					? 'closest'
					: value === furthest
						? 'furthest'
						: ''
	);
}
