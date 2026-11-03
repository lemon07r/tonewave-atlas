import { expect, test } from 'vitest';
import { rankChanges } from './rank-changes.ts';

test('first load has no markers; preference edits are keyed by product with deterministic deltas', () => {
	const track = rankChanges();
	expect(track('one', ['a', 'b', 'c']).markers.size).toBe(0);
	const changes = track('two', ['b', 'd', 'c', 'a']);
	expect([...changes.markers]).toEqual([
		['b', 1],
		['d', 'new'],
		['a', -3]
	]);
	expect(changes.summary).toBe('1 new matches, 2 moved');
	expect(track('two', ['d', 'b']).markers).toBe(changes.markers);
	expect(track('three', ['b', 'd', 'e']).summary).toBe('1 new matches, 2 moved');
});

test('sort/filter/depth responses do not create changes and empty workspaces clear the baseline', () => {
	const track = rankChanges();
	track('one', ['a', 'b']);
	expect(track('one', ['b', 'c', 'a']).markers.size).toBe(0);
	expect([...track('two', ['c', 'a', 'b', 'b']).markers]).toEqual([
		['c', 1],
		['a', 1],
		['b', -2]
	]);
	expect(track('empty', []).summary).toBe('');
	expect(track('restart', ['z']).markers.size).toBe(0);
});

test.each(['filter then rating', 'rating then filter'])(
	'coalesced %s changes cannot attribute filter movement to a preference',
	() => {
		const track = rankChanges();
		track('one', ['a', 'b', 'c'], 'all reviewers');
		// Only the final response is accepted, regardless of which action was started first.
		const coalesced = track('two', ['c', 'd', 'a'], 'at least 3 reviewers');
		expect([...coalesced.markers]).toEqual([]);
		expect(coalesced.summary).toBe('');
		expect([...track('three', ['a', 'c', 'e'], 'at least 3 reviewers').markers]).toEqual([
			['a', 2],
			['c', -1],
			['e', 'new']
		]);
	}
);

test('a changed ranking context clears old preference markers and becomes the accepted baseline', () => {
	const track = rankChanges();
	track('one', ['a', 'b'], 'mean');
	expect(track('two', ['b', 'a'], 'mean').markers.size).toBe(2);
	expect(track('two', ['a', 'b'], 'minimax')).toEqual({ markers: new Map(), summary: '' });
});
