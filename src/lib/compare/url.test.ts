import { describe, expect, it } from 'vitest';
import { parseCompare, serialiseCompare, type CompareState } from './url.ts';

describe('comparison URL state', () => {
	it('round trips products, measurements, channel, smoothing and baseline', () => {
		const state: CompareState = {
			products: ['p-one', 'p-two'],
			measurements: ['m-three'],
			channel: 'R',
			smoothing: 6,
			difference: 'm-three'
		};
		expect(parseCompare(serialiseCompare(state))).toEqual(state);
	});
	it('ignores invalid input, duplicate identities and unavailable baselines', () => {
		expect(
			parseCompare(new URLSearchParams('p=p-one,p-one,<script>&m=m-one&ch=no&smooth=99&diff=missing'))
		).toEqual({
			products: ['p-one'],
			measurements: ['m-one'],
			channel: 'avg',
			smoothing: 12,
			difference: ''
		});
	});
	it('limits the combined selection to six and preserves form mode', () => {
		const state = parseCompare(new URLSearchParams('p=a,b,c,d,e&m=f,g'));
		expect(state.measurements).toEqual(['f']);
		expect(serialiseCompare(state, new URLSearchParams('form=headphones')).get('form')).toBe('headphones');
	});
	it('round trips the empty defaults and an unsmoothed curve', () => {
		const state = parseCompare(new URLSearchParams());
		expect(parseCompare(serialiseCompare(state))).toEqual(state);
		expect(parseCompare(new URLSearchParams('smooth=0')).smoothing).toBe(0);
	});
});
