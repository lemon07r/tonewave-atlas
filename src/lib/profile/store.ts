import { emptyProfile, parseProfile, PROFILE_KEY, type Profile } from './profile.ts';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

/** Storage is injected so migrations, unavailable storage and undo are independently testable. */
export function profileStore(storage: Storage) {
	let value = emptyProfile();
	let previous: Profile | undefined;
	let error = '';
	try {
		const saved = storage.getItem(PROFILE_KEY);
		if (saved) value = parseProfile(saved);
	} catch {
		error = 'Saved profile could not be read. It has not been overwritten; export your edits to keep them.';
	}
	function write(next: Profile) {
		value = next;
		try {
			storage.setItem(PROFILE_KEY, JSON.stringify(next));
			error = '';
		} catch {
			error = 'Browser storage is unavailable. Export your profile to keep these edits.';
		}
	}
	return {
		get value() {
			return value;
		},
		get error() {
			return error;
		},
		get canUndo() {
			return previous !== undefined;
		},
		change(next: Profile, before = value) {
			previous = before;
			write(next);
		},
		/** Migration Undo keeps the persisted canonical profile; only this session is restored. */
		restoreSession(before: Profile) {
			value = before;
			previous = undefined;
		},
		undo() {
			if (previous) {
				const restore = previous;
				previous = undefined;
				write(restore);
			}
		},
		dismiss() {
			previous = undefined;
		}
	};
}
