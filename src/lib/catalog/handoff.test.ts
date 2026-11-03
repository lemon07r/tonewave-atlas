import { expect, test } from 'vitest';
import { emptyProfile } from '#lib/profile/profile.ts';
import { handoffMigration, recallMigration, rememberMigration, takeMigration } from './handoff.ts';

test('a form-changing navigation carries its notice and Undo snapshot exactly once', () => {
	const state = {
		target: 'https://example.org/?form=headphones',
		messages: ['Moved to Headphones'],
		before: { profile: emptyProfile(), url: 'https://example.org/' }
	};
	handoffMigration(state);
	expect(takeMigration(state.target)).toBe(state);
	expect(takeMigration(state.target)).toBeUndefined();
});

test('an unrelated navigation cannot inherit a stale notice or restored session', () => {
	handoffMigration({
		target: 'https://example.org/?form=headphones',
		messages: [],
		restored: emptyProfile(),
		undone: true
	});
	expect(takeMigration('https://example.org/explore')).toBeUndefined();
	expect(takeMigration('https://example.org/?form=headphones')).toBeUndefined();
});

test('a pending migration snapshot is recalled until it is cleared, and malformed state is ignored', () => {
	const map = new Map<string, string>();
	const storage = () => ({
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, value),
		removeItem: (key: string) => void map.delete(key)
	});
	const before = { profile: emptyProfile(), url: 'https://example.org/?rig=iem-711' };
	expect(recallMigration(storage)).toBeUndefined();
	expect(rememberMigration(storage, before)).toBe(true);
	expect(recallMigration(storage)).toEqual(before);
	rememberMigration(storage, undefined);
	expect(recallMigration(storage)).toBeUndefined();
	map.set('tonewave.migration.pending.v1', '{"profile":{"version":9},"url":"/"}');
	expect(recallMigration(storage)).toBeUndefined();
	const blocked = () => {
		throw new Error('blocked');
	};
	expect(rememberMigration(blocked, before)).toBe(false);
	expect(recallMigration(blocked)).toBeUndefined();
});
