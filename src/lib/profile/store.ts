import { emptyProfile, parseProfile, PROFILE_KEY, type Profile } from './profile.ts';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

/** Storage is injected so migrations, unavailable storage and undo are independently testable. */
export function profileStore(storage: Storage) {
	let value = emptyProfile();
	let previous: Profile | undefined;
	let error = '';
	let sessionOnly = false;
	try {
		const saved = storage.getItem(PROFILE_KEY);
		if (saved) value = parseProfile(saved);
	} catch {
		sessionOnly = true;
		error =
			'Saved profile could not be read. It has not been overwritten. Edits stay in this session; export them to keep them.';
	}
	function write(next: Profile) {
		value = next;
		if (sessionOnly) return;
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
			sessionOnly = true;
			error =
				'This restored profile and further edits are session-only. The saved canonical profile is unchanged; export your edits to keep them.';
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
