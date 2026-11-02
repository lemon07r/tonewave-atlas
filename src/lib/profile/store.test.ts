import { expect, test, vi } from 'vitest';
import { emptyProfile, PROFILE_KEY, type Profile } from './profile.ts';
import { profileStore } from './store.ts';

const edited: Profile = {
	version: 2,
	profiles: { iem: [{ productId: 'new', rating: 'like', strength: 0.6, soundRelated: true }], headphone: [] }
};

test('an unreadable profile survives edits and Undo without losing its recovery notice', () => {
	const setItem = vi.fn();
	const store = profileStore({ getItem: () => '{broken', setItem });
	store.change(edited);
	expect(store.value).toEqual(edited);
	expect(store.error).toContain('has not been overwritten');
	store.undo();
	expect(store.value).toEqual(emptyProfile());
	expect(setItem).not.toHaveBeenCalled();
});

test('a restored migration session cannot overwrite canonical storage on the next edit or Undo', () => {
	const setItem = vi.fn();
	const canonical = emptyProfile();
	const store = profileStore({ getItem: () => JSON.stringify(canonical), setItem });
	store.restoreSession(edited);
	store.change({
		...edited,
		profiles: {
			...edited.profiles,
			iem: [{ productId: 'new', soundRelated: true, rating: 'love', strength: 1 }]
		}
	});
	store.undo();
	expect(store.value).toEqual(edited);
	expect(store.error).toContain('session-only');
	expect(setItem).not.toHaveBeenCalled();
	expect(PROFILE_KEY).toBe('tonewave.profile.v1');
});
