import { expect, test } from 'vitest';
import { discoveryRoute, parseDiscovery, withItems } from './state.ts';
import { emptyProfile, parseProfile, soundItems, type WorkspaceItem } from '#lib/profile/profile.ts';
import { profileStore } from '#lib/profile/store.ts';
import { latestQuery } from './query.ts';

const like: WorkspaceItem = { productId: 'a', rating: 'like', strength: 0.6, soundRelated: true };
test('migrates an explicit old reference and all advanced share settings without guessing a new reference', () => {
	const state = parseDiscovery(
		new URLSearchParams(
			'mode=similar&ref=a&m=variant&focus=bass&alpha=2&max=80&sources=s1,s2&tunings=1&rig=iem-711'
		)
	);
	expect(state.items).toEqual([{ ...like, measurementId: 'variant' }]);
	expect(state).toMatchObject({
		focus: 'bass',
		alpha: 2,
		max: 80,
		sources: ['s1', 's2'],
		tunings: true,
		rig: 'iem-711'
	});
	expect(parseDiscovery(new URLSearchParams()).items).toBeUndefined();
});
test('restores legacy taste URLs, ratings and corrections; explicit empty URL ratings beat storage', () => {
	const params = new URLSearchParams({
		mode: 'taste',
		ratings: JSON.stringify([like]),
		edits: '[{"tasteId":0,"bands":{"bass":1}}]'
	});
	expect(parseDiscovery(params)).toMatchObject({
		view: 'taste',
		items: [like],
		corrections: [{ tasteId: 0, bands: { bass: 1 } }]
	});
	expect(parseDiscovery(new URLSearchParams('ratings=[]')).items).toEqual([]);
	expect(parseDiscovery(new URLSearchParams('ratings=invalid')).issue).not.toBe('');
	const shared = withItems(new URLSearchParams('ref=old&focus=treble&alpha=2&max=99&rig=iem-711'), [like]);
	expect(shared.has('ref')).toBe(false);
	expect(parseDiscovery(shared)).toMatchObject({
		items: [like],
		focus: 'treble',
		alpha: 2,
		max: 99,
		rig: 'iem-711'
	});
});
test('routes one like, two to four likes, dislikes and five rated products; comfort is not sound', () => {
	const likes = Array.from({ length: 5 }, (_, i) => ({ ...like, productId: String(i) }));
	expect(discoveryRoute([], 'auto')).toBe('empty');
	expect(discoveryRoute(likes.slice(0, 1), 'auto')).toBe('similar');
	for (const n of [2, 3, 4]) expect(discoveryRoute(likes.slice(0, n), 'auto')).toBe('compare');
	expect(discoveryRoute(likes, 'auto')).toBe('taste');
	expect(
		discoveryRoute(
			[...likes.slice(0, 4), { ...like, productId: 'neutral', rating: 'neutral', strength: 0 }],
			'auto'
		)
	).toBe('taste');
	expect(soundItems([{ ...like, rating: 'neutral', strength: 0 }])).toEqual([]);
	expect(discoveryRoute([like, { ...like, productId: 'b', rating: 'dislike' }], 'auto')).toBe('taste');
	expect(
		discoveryRoute([like, { ...like, productId: 'b', rating: 'dislike', soundRelated: false }], 'auto')
	).toBe('similar');
	expect(discoveryRoute(likes.slice(0, 2), 'taste')).toBe('taste');
	expect(soundItems([{ ...like, rating: 'unrated', strength: 0 }])).toEqual([]);
});
test('migrates v1 localStorage losslessly and undoes clear, removal and ratings including an unrated item', () => {
	let saved = JSON.stringify({ version: 1, profiles: { iem: [like], headphone: [] } });
	const store = profileStore({
		getItem: () => saved,
		setItem: (_, text) => {
			saved = text;
		}
	});
	expect(store.value).toEqual({ ...emptyProfile(), profiles: { iem: [like], headphone: [] } });
	const previous = store.value;
	store.change(emptyProfile());
	store.undo();
	expect(store.value).toEqual(previous);
	const next = {
		...previous,
		profiles: { ...previous.profiles, iem: [{ ...like, rating: 'unrated' as const, strength: 0 }] }
	};
	store.change(next);
	expect(parseProfile(saved)).toEqual(next);
	store.undo();
	expect(store.value).toEqual(previous);
});
test('rejects older query successes and errors after a newer query or invalidation', async () => {
	const controller = latestQuery<string>();
	let release: (value: string) => void = () => {};
	const received: string[] = [];
	const first = controller.run(
		() =>
			new Promise((resolve) => {
				release = resolve;
			}),
		(value) => received.push(value),
		() => received.push('error')
	);
	await controller.run(
		() => Promise.resolve('new'),
		(value) => received.push(value),
		() => {}
	);
	release('old');
	await first;
	expect(received).toEqual(['new']);
	const pending = controller.run(
		() => Promise.resolve('invalidated'),
		(value) => received.push(value),
		() => {}
	);
	controller.invalidate();
	await pending;
	expect(received).toEqual(['new']);
});
