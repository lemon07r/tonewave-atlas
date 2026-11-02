import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { DatasetFile, Manifest, Source } from '#core/dataset/types.ts';
import { atomicWrite, errorMessage, OUTPUT, record, sha256, USER_AGENT } from './common.ts';
import { parallelEach } from './cache.ts';

/** Strict paths and checksums are required before any remote filename reaches the local filesystem. */
export function validateManifest(value: unknown): Manifest {
	if (
		!record(value) ||
		value.formatVersion !== 1 ||
		typeof value.version !== 'string' ||
		!/^[a-f0-9]{24}$/.test(value.version) ||
		typeof value.builtAt !== 'string' ||
		!Number.isFinite(Date.parse(value.builtAt)) ||
		!Array.isArray(value.files) ||
		!Array.isArray(value.sources)
	)
		throw new Error('Invalid dataset manifest');
	if (value.files.length >= 19000 || !value.files.length) throw new Error('Invalid manifest file count');
	const version = value.version;
	const files: DatasetFile[] = value.files.map((f: unknown) => {
		if (
			!record(f) ||
			typeof f.path !== 'string' ||
			!f.path.startsWith(`${version}/`) ||
			!/^[a-f0-9]{24}\/(?:catalog-(?:iem|headphone)\.json|(?:rank|detail)-[a-z0-9-]+\.bin)\.gz$/.test(
				f.path
			) ||
			typeof f.sha256 !== 'string' ||
			!/^[a-f0-9]{64}$/.test(f.sha256) ||
			typeof f.bytes !== 'number' ||
			!Number.isInteger(f.bytes) ||
			f.bytes <= 0 ||
			f.bytes >= 25 * 1024 * 1024
		)
			throw new Error('Invalid dataset file');
		return { path: f.path, sha256: f.sha256, bytes: f.bytes };
	});
	if (new Set(files.map((f) => f.path)).size !== files.length) throw new Error('Duplicate dataset path');
	const sources: Source[] = value.sources.map((s: unknown) => {
		if (
			!record(s) ||
			typeof s.id !== 'string' ||
			typeof s.username !== 'string' ||
			typeof s.name !== 'string' ||
			typeof s.url !== 'string' ||
			!/^https:\/\//.test(s.url) ||
			typeof s.dbType !== 'string' ||
			(s.form !== 'iem' && s.form !== 'headphone') ||
			typeof s.partition !== 'string' ||
			!(s.rig === null || typeof s.rig === 'string') ||
			typeof s.rigInferred !== 'boolean' ||
			(s.permission !== 'public, not explicitly licensed' && s.permission !== 'permission granted') ||
			typeof s.crawledAt !== 'string' ||
			!(s.calibration === null || typeof s.calibration === 'string')
		)
			throw new Error('Invalid source attribution');
		return {
			id: s.id,
			username: s.username,
			name: s.name,
			url: s.url,
			dbType: s.dbType,
			form: s.form,
			partition: s.partition,
			rig: s.rig,
			rigInferred: s.rigInferred,
			permission: s.permission,
			crawledAt: s.crawledAt,
			calibration: s.calibration
		};
	});
	return { formatVersion: 1, version, builtAt: value.builtAt, files, sources };
}

export async function pull(
	base = process.env.DATASET_URL ?? 'https://tonewave.lr7.dev/data/',
	output = OUTPUT
): Promise<void> {
	const url = new URL(base.endsWith('/') ? base : `${base}/`);
	if (!['http:', 'https:'].includes(url.protocol)) throw new Error('DATASET_URL must be HTTP(S)');
	const get = (name: string) =>
		fetch(new URL(name, url), { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(120000) });
	const response = await get('manifest.json');
	if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
	const manifestText = await response.text();
	const manifest = validateManifest(JSON.parse(manifestText) as unknown);
	await mkdir(output, { recursive: true });
	const staging = resolve(output, `.pull-${randomUUID()}`);
	await mkdir(staging, { recursive: true });
	try {
		await parallelEach(manifest.files, async (file) => {
			const response = await get(file.path);
			if (!response.ok) throw new Error(`${file.path}: HTTP ${response.status}`);
			const bytes = new Uint8Array(await response.arrayBuffer());
			if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256)
				throw new Error(`${file.path}: size/sha256 mismatch`);
			await atomicWrite(resolve(staging, file.path.slice(manifest.version.length + 1)), bytes);
		});
		await rm(resolve(output, manifest.version), { recursive: true, force: true });
		await rename(staging, resolve(output, manifest.version));
		await atomicWrite(resolve(output, 'manifest.json'), manifestText);
		for (const entry of await readdir(output, { withFileTypes: true }))
			if (entry.isDirectory() && /^[a-f0-9]{24}$/.test(entry.name) && entry.name !== manifest.version)
				await rm(resolve(output, entry.name), { recursive: true });
	} finally {
		await rm(staging, { recursive: true, force: true });
	}
	console.log(
		`Pulled ${manifest.version}: ${manifest.files.length} verified files, ${manifest.files.reduce((n, f) => n + f.bytes, 0)} bytes`
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
	pull().catch((e: unknown) => {
		console.error(errorMessage(e));
		process.exitCode = 1;
	});
