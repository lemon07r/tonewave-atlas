import type { Profile } from '#lib/profile/profile.ts';

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
