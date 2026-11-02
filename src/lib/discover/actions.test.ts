import { expect, test } from 'vitest';
import { compareQuery } from './actions.ts';
import type { CandidateInfo } from '#core/atlas/types.ts';

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
