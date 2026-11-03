import { parseProfile, type Profile } from '#lib/profile/profile.ts';

export interface MigrationHandoff {
	target: string;
	messages: string[];
	before?: { profile: Profile; url: string } | undefined;
	restored?: Profile;
	undone?: boolean;
}

// Discover remounts when its form changes. Keep only this navigation's notice/Undo in memory.
let pending: MigrationHandoff | undefined;

export function handoffMigration(state: MigrationHandoff): void {
	pending = state;
}

export function takeMigration(href: string): MigrationHandoff | undefined {
	const state = pending;
	pending = undefined;
	return state?.target === href ? state : undefined;
}

type TabStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const PENDING_KEY = 'tonewave.migration.pending.v1';

/** A dropped-rating snapshot survives reloads and remounts in this tab until Undo or Dismiss clears it. */
export function rememberMigration(
	storage: () => TabStorage,
	before: { profile: Profile; url: string } | undefined
): void {
	try {
		if (before) storage().setItem(PENDING_KEY, JSON.stringify(before));
		else storage().removeItem(PENDING_KEY);
	} catch {
		/* Without tab storage the snapshot lasts for this page only. */
	}
}

export function recallMigration(storage: () => TabStorage): { profile: Profile; url: string } | undefined {
	try {
		const text = storage().getItem(PENDING_KEY);
		if (!text) return undefined;
		const saved = JSON.parse(text) as { profile?: unknown; url?: unknown };
		if (typeof saved.url !== 'string') return undefined;
		return { profile: parseProfile(JSON.stringify(saved.profile)), url: saved.url };
	} catch {
		return undefined;
	}
}
