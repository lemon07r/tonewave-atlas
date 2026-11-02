import { expect, test } from 'vitest';
import type { BandDistance } from '#core/analysis/distance.ts';
import type { CandidateInfo } from '#core/atlas/types.ts';
import { describeBands, priceLines, reviewerSummary } from './describe.ts';

function band(meanDb: number | null, name: BandDistance['band'] = 'bass'): BandDistance {
	return { band: name, meanDb, rmsDb: null, contribution: 0, coverage: 1 };
}
test('uses editorial thresholds with exact boundary and signed-direction expectations', () => {
	expect(describeBands([band(0.749), band(null)])).toBe(
		'No band mean differs by 0.75 dB or more where measured.'
	);
	expect(describeBands([band(0.75, 'sub-bass'), band(-1.999, 'presence')])).toBe(
		'Slightly less presence, slightly more sub-bass'
	);
	expect(describeBands([band(2), band(-3.999, 'mid'), band(4, 'low-mid')])).toBe(
		'Much more lower mids, less mids'
	);
	expect(describeBands([band(-4, 'air')])).toBe('Much less air · differences above 8 kHz are less reliable');
	expect(describeBands([band(NaN)])).toContain('No band mean');
});
test('mentions high-frequency reliability once, only when an affected difference is described', () => {
	expect(describeBands([band(2, 'treble'), band(-2, 'air')])).toBe(
		'More treble, less air · differences above 8 kHz are less reliable'
	);
	expect(describeBands([band(2), band(0.74, 'treble'), band(null, 'air')])).toBe('More bass');
	expect(describeBands([band(0.74, 'air')])).toBe('No band mean differs by 0.75 dB or more where measured.');
});
test('collapses equal rounded reviewer endpoints without hiding distinct rounded values', () => {
	expect(reviewerSummary([0.66, 0.74], 3)).toBe('0.7 dB across 3 reviewers');
	expect(reviewerSummary([0.64, 0.76], 3)).toBe('0.6–0.8 dB across 3 reviewers');
	expect(reviewerSummary([0.7, 0.7], 1)).toBe('0.7 dB across 1 reviewer');
	expect(reviewerSummary(null, 1)).toBe('1 reviewer');
	expect(reviewerSummary(null, 3)).toBe('3 reviewers');
});
test('never converts raw prices or prints an unattributed amount', () => {
	const candidate = {
		prices: [{ raw: '€100', usd: null, sourceId: 'a', crawledAt: '2026-11-01' }],
		sources: [{ id: 'a', name: 'Database A' }]
	} as CandidateInfo;
	expect(priceLines(candidate)).toEqual([]);
	const listing = candidate.prices[0];
	if (!listing) throw new Error('Test fixture requires a listing');
	listing.usd = 129;
	expect(priceLines(candidate)).toEqual(['$129 listed by Database A, Nov 2026']);
	listing.crawledAt = 'date not provided';
	expect(priceLines(candidate)).toEqual(['$129 listed by Database A, date not provided']);
	listing.usd = Infinity;
	expect(priceLines(candidate)).toEqual([]);
	listing.usd = 129;
	listing.sourceId = 'missing';
	expect(priceLines(candidate)).toEqual([]);
});
