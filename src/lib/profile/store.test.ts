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

test('a restored migration session and later edits survive a new store without touching canonical storage', () => {
	const setItem = vi.fn();
	const canonical = { getItem: () => JSON.stringify(emptyProfile()), setItem };
	const values = new Map<string, string>();
	const session = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		}
	};
	const first = profileStore(canonical, session);
	first.restoreSession(edited);
	const remount = profileStore(canonical, session);
	expect(remount.value).toEqual(edited);
	expect(remount.restoredSession).toBe(true);
	const next = { ...edited, profiles: { ...edited.profiles, headphone: edited.profiles.iem } };
	remount.change(next);
	expect(profileStore(canonical, session).value).toEqual(next);
	remount.undo();
	expect(profileStore(canonical, session).value).toEqual(edited);
	expect(profileStore(canonical).value).toEqual(emptyProfile());
	expect(setItem).not.toHaveBeenCalled();
});

test('malformed tab state is ignored, and failed session writes never fall back to canonical writes', () => {
	const setItem = vi.fn();
	const storage = { getItem: () => JSON.stringify(emptyProfile()), setItem };
	const store = profileStore(storage, {
		getItem: () => '{invalid',
		setItem: () => {
			throw new Error('blocked');
		}
	});
	expect(store.value).toEqual(emptyProfile());
	expect(store.restoredSession).toBe(false);
	store.restoreSession(edited);
	store.change(emptyProfile());
	store.undo();
	expect(store.value).toEqual(edited);
	expect(store.error).toContain('Tab storage is unavailable');
	expect(setItem).not.toHaveBeenCalled();
});

test('malformed tab state keeps the next edit out of canonical storage and says so', () => {
	const setItem = vi.fn();
	const store = profileStore(
		{ getItem: () => JSON.stringify(emptyProfile()), setItem },
		{ getItem: () => '{invalid', setItem: vi.fn() }
	);
	expect(store.error).toContain('Restored tab state could not be read');
	store.change(edited);
	expect(store.value).toEqual(edited);
	expect(setItem).not.toHaveBeenCalled();
});

test('an unreadable canonical profile keeps its warning when a restored session also loads', () => {
	const store = profileStore(
		{ getItem: () => '{broken', setItem: vi.fn() },
		{ getItem: () => JSON.stringify(edited), setItem: vi.fn() }
	);
	expect(store.value).toEqual(edited);
	expect(store.error).toContain('has not been overwritten');
	expect(store.error).toContain('session-only');
});

test('a recovered tab storage write clears the unavailable warning', () => {
	let fail = true;
	const session = {
		getItem: () => null,
		setItem: () => {
			if (fail) throw new Error('blocked');
		}
	};
	const store = profileStore({ getItem: () => null, setItem: vi.fn() }, session);
	store.restoreSession(edited);
	store.change(emptyProfile());
	expect(store.error).toContain('Tab storage is unavailable');
	fail = false;
	store.change(edited);
	expect(store.error).not.toContain('Tab storage is unavailable');
	expect(store.error).toContain('session-only');
});
