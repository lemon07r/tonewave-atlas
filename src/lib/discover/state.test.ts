import { expect, test, vi } from 'vitest';
import {
	discoveryRoute,
	parseDiscovery,
	withItems,
	withDiscoveryChanges,
	withForm,
	FORM_SCOPED_DISCOVERY_KEYS
} from './state.ts';
import { emptyProfile, parseProfile, soundItems, type WorkspaceItem } from '#lib/profile/profile.ts';
import { profileStore } from '#lib/profile/store.ts';
import { latestQuery } from './query.ts';

const like: WorkspaceItem = { productId: 'a', rating: 'like', strength: 0.6, soundRelated: true };
test('modified products and minimum reviewers round-trip with defaults omitted', () => {
	expect(parseDiscovery(new URLSearchParams())).toMatchObject({ modified: false, minReviewers: 1 });
	for (const count of [1, 2, 3, 5]) {
		const params = withDiscoveryChanges(new URLSearchParams('unknown=keep'), {
			modified: '1',
			minReviewers: String(count)
		});
		expect(parseDiscovery(params)).toMatchObject({ modified: true, minReviewers: count });
		expect(params.has('minReviewers')).toBe(count !== 1);
		expect(params.get('unknown')).toBe('keep');
	}
	for (const count of ['0', '-1', '4', 'NaN', '2.5'])
		expect(parseDiscovery(new URLSearchParams({ minReviewers: count })).minReviewers).toBe(1);
	const reset = withDiscoveryChanges(new URLSearchParams('modified=1&minReviewers=3'), {
		modified: undefined,
		minReviewers: '1'
	});
	expect(reset.toString()).toBe('');
});
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
	expect(state.sourceMode).toBe('coverage');
	expect(parseDiscovery(new URLSearchParams('sourceMode=only')).sourceMode).toBe('coverage');
	expect(parseDiscovery(new URLSearchParams('sources=a&sourceMode=only')).sourceMode).toBe('only');
	expect(parseDiscovery(new URLSearchParams('sourceMode=invalid')).sourceMode).toBe('coverage');
});

test('clears empty source-only mode and old-model edits atomically on every model setting update', () => {
	const params = new URLSearchParams(
		'rig=iem-711&sources=a&sourceMode=only&edits=[{"tasteId":0,"bands":{"bass":2}}]'
	);
	for (const changes of [
		{ sources: '' },
		{ sources: undefined },
		{ rig: 'iem-5128', sources: undefined },
		{ rig: 'iem-711', sources: undefined, chart: undefined }
	]) {
		const next = withDiscoveryChanges(params, changes);
		expect(next.has('sourceMode')).toBe(false);
		expect(next.has('edits')).toBe(false);
	}
	for (const changes of [{ sources: 'b' }, { sourceMode: undefined }, { rig: 'iem-5128' }])
		expect(withDiscoveryChanges(params, changes).has('edits')).toBe(false);
	expect(withDiscoveryChanges(params, { chart: 'match' }).get('edits')).toBe(params.get('edits'));
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
	).toBe('compare');
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

test('invalid corrections do not discard valid shared ratings or substitute saved ratings', () => {
	for (const edits of ['{broken', '{}', '[{"tasteId":0,"bands":{"bass":5}}]']) {
		const state = parseDiscovery(new URLSearchParams({ ratings: JSON.stringify([like]), edits }));
		expect(state.items).toEqual([like]);
		expect(state.corrections).toEqual([]);
		expect(state.issue).toContain('invalid corrections');
		expect(parseDiscovery(new URLSearchParams({ edits })).items).toBeUndefined();
	}
});

test('corrections accept one entry per supported profile item, not just twenty', () => {
	const edits = Array.from({ length: 200 }, (_, tasteId) => ({ tasteId, bands: { bass: 1 } }));
	expect(parseDiscovery(new URLSearchParams({ edits: JSON.stringify(edits) })).corrections).toEqual(edits);
	expect(parseDiscovery(new URLSearchParams({ edits: JSON.stringify([...edits, edits[0]]) })).issue).not.toBe(
		''
	);
});

test('every edit to a legacy taste URL retains the explicit taste view', () => {
	for (const mode of ['taste', 'profile']) {
		const next = withItems(new URLSearchParams({ mode }), [like, { ...like, productId: 'b' }]);
		expect(next.has('mode')).toBe(false);
		expect(parseDiscovery(next).view).toBe('taste');
	}
});

test('form switches preserve shared ratings per form and clear all form-specific selections', () => {
	const url = new URL('https://example.org/compare?focus=bass&unknown=keep#main');
	for (const key of FORM_SCOPED_DISCOVERY_KEYS) url.searchParams.set(key, 'old');
	url.searchParams.set('ratings', JSON.stringify([like]));
	for (const key of ['p', 'diff', 'product', 'measurement']) url.searchParams.set(key, 'old');
	const headphone = withForm(url, 'headphone');
	for (const key of FORM_SCOPED_DISCOVERY_KEYS) expect(headphone.searchParams.has(key)).toBe(false);
	for (const key of ['p', 'diff', 'product', 'measurement'])
		expect(headphone.searchParams.has(key)).toBe(false);
	headphone.searchParams.set('ratings', '[]');
	const restored = withForm(headphone, 'iem');
	expect(parseDiscovery(restored.searchParams).items).toEqual([like]);
	expect(withForm(restored, 'headphone').searchParams.get('ratings')).toBe('[]');
	expect(restored.searchParams.get('unknown')).toBe('keep');
	expect(restored.hash).toBe('#main');
});

test('result depth round-trips and invalid depth falls back to the first page', () => {
	expect(parseDiscovery(new URLSearchParams('depth=40')).depth).toBe(40);
	for (const depth of ['NaN', 'Infinity', '-1', '21.5'])
		expect(parseDiscovery(new URLSearchParams({ depth })).depth).toBe(20);
	expect(withItems(new URLSearchParams('depth=40'), [like]).has('depth')).toBe(false);
});

test('an older query rejection is ignored after a newer query or invalidation', async () => {
	for (const invalidate of [false, true]) {
		const controller = latestQuery<string>();
		const reject = vi.fn();
		let fail: (cause: Error) => void = () => {};
		const pending = controller.run(
			() =>
				new Promise((_, reject) => {
					fail = reject;
				}),
			vi.fn(),
			reject
		);
		if (invalidate) controller.invalidate();
		else await controller.run(() => Promise.resolve('new'), vi.fn(), reject);
		fail(new Error('old failure'));
		await pending;
		expect(reject).not.toHaveBeenCalled();
	}
});
