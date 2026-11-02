import { lstat, readFile, readdir, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { Manifest } from '#core/dataset/types.ts';
import { atomicWrite, errorMessage, sha256 } from './common.ts';

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
	version: string,
	committed: boolean,
	preserveBackup: boolean
): Promise<void> {
	await removeStaging(staging);
	try {
		for (const entry of await readdir(output, { withFileTypes: true })) {
			// Publication is serial: another active build/pull must not share this output directory.
			// Preserve the sole recovery copy if rollback itself failed; never delete live data.
			if (preserveBackup && entry.name === `.backup-${version}`) continue;
			if (
				/^\.(?:build|pull|backup|interrupted)-/.test(entry.name) ||
				(committed && /^[a-f0-9]{24}$/.test(entry.name) && entry.name !== version)
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
	let verifiedTarget = false;
	try {
		if (await matches(target, manifest)) {
			verifiedTarget = true;
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
		await sweep(output, staging, manifest.version, committed, !committed && !verifiedTarget);
	}
}
