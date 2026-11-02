import { expect, test } from 'vitest';
import type { BandDistance } from '#core/analysis/distance.ts';
import type { CandidateInfo } from '#core/atlas/types.ts';
import { describeBands, priceLines } from './describe.ts';

function band(meanDb: number | null, name: BandDistance['band'] = 'bass'): BandDistance {
	return { band: name, meanDb, rmsDb: null, contribution: 0, coverage: 1 };
}
test('uses editorial thresholds with exact boundary and signed-direction expectations', () => {
	expect(describeBands([band(0.749), band(null)])).toBe(
		'No band mean differs by 0.75 dB or more where measured.'
	);
	expect(describeBands([band(0.75, 'sub-bass'), band(-1.999, 'presence')])).toBe(
		'Slightly more sub-bass, slightly less presence'
	);
	expect(describeBands([band(2), band(-3.999, 'mid'), band(4, 'low-mid')])).toBe(
		'More bass, less mids, much more lower mids'
	);
	expect(describeBands([band(-4, 'air')])).toBe('Much less air (less reliable above 8 kHz)');
	expect(describeBands([band(NaN)])).toContain('No band mean');
});
test('never converts raw prices or prints an unattributed amount', () => {
	const candidate = {
		prices: [{ raw: '€100', usd: null, sourceId: 'a', crawledAt: '2026-11-01' }],
		sources: [{ id: 'a', name: 'Database A' }]
	} as CandidateInfo;
	expect(priceLines(candidate)).toEqual([]);
	candidate.prices[0]!.usd = 129;
	expect(priceLines(candidate)).toEqual(['$129 listed by Database A, Nov 2026']);
	candidate.prices[0]!.sourceId = 'missing';
	expect(priceLines(candidate)).toEqual([]);
});
