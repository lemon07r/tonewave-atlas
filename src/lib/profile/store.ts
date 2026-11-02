import { emptyProfile, parseProfile, PROFILE_KEY, type Profile } from './profile.ts';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const SESSION_KEY = 'tonewave.profile.session.v1';
const restoredNotice =
	'This restored profile and further edits are session-only. The saved canonical profile is unchanged; export your edits to keep them.';

/** Storage is injected so migrations, unavailable storage and undo are independently testable. */
export function profileStore(storage: Storage, session?: Storage) {
	let value = emptyProfile();
	let previous: Profile | undefined;
	// Read problems found at startup stay visible; write status messages are appended and replaced.
	let readError = '';
	let error = '';
	const withRead = (message: string) => [readError, message].filter(Boolean).join(' ');
	let sessionOnly = false;
	let restoredSession = false;
	try {
		const saved = storage.getItem(PROFILE_KEY);
		if (saved) value = parseProfile(saved);
	} catch {
		sessionOnly = true;
		readError =
			'Saved profile could not be read. It has not been overwritten. Edits stay in this session; export them to keep them.';
		error = readError;
	}
	try {
		const restored = session?.getItem(SESSION_KEY);
		if (restored) {
			value = parseProfile(restored);
			sessionOnly = restoredSession = true;
			error = withRead(restoredNotice);
		}
	} catch {
		// Unreadable tab state means an Undo was in progress; never let the next edit overwrite canonical storage.
		sessionOnly = true;
		readError = withRead(
			'Restored tab state could not be read. Edits stay in this session; export them to keep them.'
		);
		error = readError;
	}
	function saveSession(next: Profile) {
		try {
			if (!session) throw new Error('Tab storage is unavailable');
			session.setItem(SESSION_KEY, JSON.stringify(next));
			error = withRead(restoredNotice);
		} catch {
			error = withRead(`${restoredNotice} Tab storage is unavailable; export before leaving this workspace.`);
		}
	}
	function write(next: Profile) {
		value = next;
		if (sessionOnly) {
			if (restoredSession) saveSession(next);
			return;
		}
		try {
			storage.setItem(PROFILE_KEY, JSON.stringify(next));
			error = readError;
		} catch {
			error = withRead('Browser storage is unavailable. Export your profile to keep these edits.');
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
		get restoredSession() {
			return restoredSession;
		},
		change(next: Profile, before = value) {
			previous = before;
			write(next);
		},
		/** Migration Undo keeps the persisted canonical profile; only this session is restored. */
		restoreSession(before: Profile) {
			value = before;
			previous = undefined;
			sessionOnly = restoredSession = true;
			error = withRead(restoredNotice);
			saveSession(before);
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
