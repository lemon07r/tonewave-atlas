import { expect, test } from 'vitest';
import { signedDb } from './format.ts';

test.each([
	[6, '+6.0'],
	[-2.5, '−2.5'],
	[-3.4, '−3.4'],
	[0, '+0.0'],
	[-0, '+0.0'],
	[-0.04, '+0.0'],
	[-0.06, '−0.1'],
	[NaN, '—'],
	[Infinity, '—']
])('formats signed dB %s as %s', (value, expected) => {
	expect(signedDb(value)).toBe(expected);
});
