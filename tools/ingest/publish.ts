import { lstat, readFile, readdir, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { Manifest } from '#core/dataset/types.ts';
import { atomicWrite, errorMessage, readJson, record, sha256 } from './common.ts';

function missing(error: unknown): boolean {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Cleanup must not turn an already-committed publication into a reported build failure. */
export async function removeStaging(path: string): Promise<void> {
	try {
		await rm(path, { recursive: true, force: true });
	} catch (error) {
		console.warn(`Dataset cleanup failed for ${path}: ${errorMessage(error)}`);
	}
}

async function sweep(
	output: string,
	staging: string,
	manifest: Manifest,
	committed: boolean,
	previousVersion: string | null
): Promise<void> {
	await removeStaging(staging);
	try {
		// Only the committed manifest can authorize deletion of recovery data. On any failed
		// publication retain *all* backups, not just the attempted version's backup.
		let verifiedCommit = false;
		if (committed) {
			const live = await readJson(resolve(output, 'manifest.json'));
			verifiedCommit =
				record(live) &&
				live.formatVersion === manifest.formatVersion &&
				live.version === manifest.version &&
				Array.isArray(live.files) &&
				live.files.length === manifest.files.length &&
				live.files.every(
					(file: unknown, i: number) =>
						record(file) &&
						file.path === manifest.files[i]?.path &&
						file.bytes === manifest.files[i]?.bytes &&
						file.sha256 === manifest.files[i]?.sha256
				) &&
				(await matches(resolve(output, manifest.version), manifest));
			if (!verifiedCommit)
				console.warn('Dataset cleanup: live manifest/target not verified; preserving backups and versions');
		}
		for (const entry of await readdir(output, { withFileTypes: true })) {
			// Publication is serial: another active build/pull must not share this output directory.
			if (!entry.isDirectory()) continue;
			if (!verifiedCommit && entry.name.startsWith('.backup-')) continue;
			if (
				/^\.(?:build|pull|backup|interrupted)-/.test(entry.name) ||
				(verifiedCommit &&
					// Re-publishing the same manifest does not advance history or identify an older version.
					previousVersion !== manifest.version &&
					/^[a-f0-9]{24}$/.test(entry.name) &&
					entry.name !== manifest.version &&
					entry.name !== previousVersion)
			)
				await removeStaging(resolve(output, entry.name));
		}
	} catch (error) {
		console.warn(`Dataset cleanup failed for ${output}: ${errorMessage(error)}`);
	}
}

async function exists(path: string): Promise<boolean> {
	try {
		await lstat(path);
		return true;
	} catch (error) {
		if (missing(error)) return false;
		throw error;
	}
}

async function matches(path: string, manifest: Manifest): Promise<boolean> {
	for (const file of manifest.files) {
		try {
			const bytes = await readFile(resolve(path, file.path.slice(manifest.version.length + 1)));
			if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) return false;
		} catch (error) {
			if (missing(error)) return false;
			throw error;
		}
	}
	return true;
}

/**
 * Keep verified live versions in place. Repairs use a recoverable backup, never rm(live).
 * After a process interruption, the next publication restores a missing target from backup
 * or completes an already-installed, hash-verified target. The manifest is committed last.
 * This serial publisher is shared by crawl builds and pulls; do not publish concurrently.
 */
export async function publishDataset(
	output: string,
	staging: string,
	manifest: Manifest,
	manifestText: string
): Promise<void> {
	const target = resolve(output, manifest.version);
	const backup = resolve(output, `.backup-${manifest.version}`);
	let committed = false;
	let previousVersion: string | null = null;
	try {
		try {
			const previous = await readJson(resolve(output, 'manifest.json'));
			if (record(previous) && typeof previous.version === 'string' && /^[a-f0-9]{24}$/.test(previous.version))
				previousVersion = previous.version;
		} catch (error) {
			if (!missing(error) && !(error instanceof SyntaxError)) throw error;
		}
		if (await matches(target, manifest)) {
			await atomicWrite(resolve(output, 'manifest.json'), manifestText);
		} else {
			// Recover a crash between old→backup and staging→target before starting a new repair.
			if (await exists(backup)) {
				const displaced = resolve(output, `.interrupted-${randomUUID()}`);
				const hadTarget = await exists(target);
				if (hadTarget) await rename(target, displaced);
				try {
					await rename(backup, target);
				} catch (error) {
					if (hadTarget) await rename(displaced, target);
					throw error;
				}
				if (hadTarget) await rm(displaced, { recursive: true });
			}
			if (!(await matches(staging, manifest))) throw new Error('Staged dataset does not match manifest');
			let backedUp = false;
			let installed = false;
			try {
				if (await exists(target)) {
					await rename(target, backup);
					backedUp = true;
				}
				await rename(staging, target);
				installed = true;
				await atomicWrite(resolve(output, 'manifest.json'), manifestText);
			} catch (error) {
				if (installed) await rename(target, staging);
				if (backedUp) await rename(backup, target);
				throw error;
			}
		}
		committed = true;
	} finally {
		await sweep(output, staging, manifest, committed, previousVersion);
	}
}
