import { expect, test } from 'vitest';
import { emptyProfile } from '#lib/profile/profile.ts';
import { handoffMigration, takeMigration } from './handoff.ts';

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
