import { expect, test } from 'vitest';
import { compareQuery } from './actions.ts';
import type { CandidateInfo } from '#core/atlas/types.ts';
import { parseCompare } from '#lib/compare/url.ts';

test('default comparison uses products; tuning comparison uses contributing measurements', () => {
	const candidate: CandidateInfo = {
		id: 'c',
		product: { id: 'b', brand: 'B', model: 'M', form: 'headphone' },
		kind: 'default',
		variantLabel: null,
		measurementIds: ['m1', 'm2'],
		sources: [],
		prices: [],
		priceUsd: null
	};
	expect(compareQuery(candidate, 'a')).toBe('form=headphones&p=a%2Cb');
	expect(compareQuery({ ...candidate, kind: 'tuning' }, 'a')).toBe('form=headphones&p=a&m=m1%2Cm2');
});

test('Compare always retains default and tuning candidates when references exceed its six slots', () => {
	const candidate: CandidateInfo = {
		id: 'c',
		product: { id: 'candidate', brand: 'B', model: 'M', form: 'iem' },
		kind: 'default',
		variantLabel: null,
		measurementIds: ['t1', 't2'],
		sources: [],
		prices: [],
		priceUsd: null
	};
	const refs = Array.from({ length: 10 }, (_, i) => ({
		productId: `p${i}`,
		...(i % 2 ? { measurementId: `m${i}` } : {})
	}));
	for (const references of [refs, refs.map(({ productId }) => ({ productId }))]) {
		const defaults = parseCompare(new URLSearchParams(compareQuery(candidate, references)));
		expect(defaults.products).toContain('candidate');
		expect(defaults.products.length + defaults.measurements.length).toBe(6);
		const tuning = parseCompare(
			new URLSearchParams(compareQuery({ ...candidate, kind: 'tuning' }, references))
		);
		expect(tuning.measurements).toContain('t1');
		expect(tuning.measurements).toContain('t2');
		expect(tuning.products.length + tuning.measurements.length).toBe(6);
	}
});
