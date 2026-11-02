import { describe, expect, it } from 'vitest';
import { requireAtlasReferences, requireAtlasWinners } from '../../../benchmarks/atlas-guards.ts';

describe('atlas benchmark workload guards', () => {
	it.each([[], ['a'], ['a', 'b'], ['a', 'b', 'c', 'd']])(
		'rejects a workload that is not three references: %j',
		(...references) => {
			expect(() => requireAtlasReferences(references)).toThrow(/three/);
		}
	);
	it('accepts exactly three references without altering them', () => {
		const references = ['a', 'b', 'c'];
		expect(requireAtlasReferences(references)).toBe('a');
		expect(references).toEqual(['a', 'b', 'c']);
	});
	it('rejects failed or empty rankings and accepts a genuinely non-empty result', () => {
		expect(() => {
			requireAtlasWinners({ ok: false }, 'similar');
		}).toThrow(/similar.*no winners/);
		expect(() => {
			requireAtlasWinners({ ok: true, results: [] }, 'taste');
		}).toThrow(/taste.*no winners/);
		expect(() => {
			requireAtlasWinners({ ok: true, results: [{ distance: 0 }] }, 'similar');
		}).not.toThrow();
	});
});
