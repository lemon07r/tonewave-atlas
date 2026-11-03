import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { DatasetFile, Manifest, Source } from '#core/dataset/types.ts';
import { atomicWrite, datasetVersion, errorMessage, OUTPUT, record, sha256, USER_AGENT } from './common.ts';
import { parallelEach } from './cache.ts';
import { publishDataset, removeStaging } from './publish.ts';

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
	const previousVersion = value.previousVersion;
	if (
		previousVersion !== undefined &&
		(typeof previousVersion !== 'string' ||
			!/^[a-f0-9]{24}$/.test(previousVersion) ||
			previousVersion === version)
	)
		throw new Error('Invalid previous version');
	const files: DatasetFile[] = value.files.map((f: unknown) => {
		if (
			!record(f) ||
			typeof f.path !== 'string' ||
			!f.path.startsWith(`${version}/`) ||
			!/^[a-f0-9]{24}\/(?:targets\.json|catalog-(?:iem|headphone)\.json|(?:rank|detail)-[a-z0-9-]+\.bin)\.gz$/.test(
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
		const evidence = s.rigEvidence;
		if (
			evidence !== undefined &&
			(!record(evidence) ||
				typeof evidence.class !== 'string' ||
				!['verified', 'evidenced', 'unknown'].includes(evidence.class) ||
				![null, '711', '5128'].includes(evidence.family as string | null) ||
				typeof evidence.rationale !== 'string' ||
				!evidence.rationale.trim())
		)
			throw new Error('Invalid rig evidence');
		if (record(evidence)) {
			if (
				evidence.configRig !== undefined &&
				evidence.configRig !== null &&
				typeof evidence.configRig !== 'string'
			)
				throw new Error('Invalid config rig text');
			for (const key of ['sharedProducts', 'projection', 'threshold', 'minimumProducts']) {
				const v = evidence[key];
				if (
					key === 'sharedProducts' &&
					v !== undefined &&
					(typeof v !== 'number' || !Number.isInteger(v) || v < 0)
				)
					throw new Error('Invalid rig evidence product support');
				if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v)))
					throw new Error('Invalid rig evidence statistic');
			}
			if (
				evidence.interval !== undefined &&
				evidence.interval !== null &&
				(!Array.isArray(evidence.interval) ||
					evidence.interval.length !== 2 ||
					!evidence.interval.every((v: unknown) => typeof v === 'number' && Number.isFinite(v)) ||
					evidence.interval[0] > evidence.interval[1])
			)
				throw new Error('Invalid rig evidence interval');
		}
		if (
			s.forms !== undefined &&
			(!Array.isArray(s.forms) || !s.forms.every((f: unknown) => f === 'iem' || f === 'headphone'))
		)
			throw new Error('Invalid source forms');
		if (
			s.partitions !== undefined &&
			(!Array.isArray(s.partitions) ||
				!s.partitions.every((p: unknown) => typeof p === 'string' && /^[a-z0-9-]+$/.test(p)))
		)
			throw new Error('Invalid source partitions');
		if (
			s.measurementCount !== undefined &&
			(typeof s.measurementCount !== 'number' ||
				!Number.isInteger(s.measurementCount) ||
				s.measurementCount < 0)
		)
			throw new Error('Invalid source measurement count');
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
			calibration: s.calibration,
			...(evidence === undefined ? {} : { rigEvidence: evidence as NonNullable<Source['rigEvidence']> }),
			...(s.forms === undefined ? {} : { forms: s.forms }),
			...(s.partitions === undefined ? {} : { partitions: s.partitions.map((p: unknown) => String(p)) }),
			...(s.measurementCount === undefined ? {} : { measurementCount: s.measurementCount })
		};
	});
	let partitions: Manifest['partitions'];
	if (value.partitions !== undefined) {
		if (!Array.isArray(value.partitions)) throw new Error('Invalid manifest partitions');
		partitions = value.partitions.map((p: unknown) => {
			if (
				!record(p) ||
				typeof p.id !== 'string' ||
				!/^[a-z0-9-]+$/.test(p.id) ||
				(p.form !== 'iem' && p.form !== 'headphone') ||
				typeof p.measurementCount !== 'number' ||
				!Number.isInteger(p.measurementCount) ||
				p.measurementCount < 0 ||
				typeof p.productCount !== 'number' ||
				!Number.isInteger(p.productCount) ||
				p.productCount < 0 ||
				p.productCount > p.measurementCount
			)
				throw new Error('Invalid manifest partition counts');
			return { id: p.id, form: p.form, measurementCount: p.measurementCount, productCount: p.productCount };
		});
		if (new Set(partitions.map((p) => p.id)).size !== partitions.length)
			throw new Error('Duplicate manifest partition');
	}
	if (
		datasetVersion(
			files.map((file) => ({ ...file, path: file.path.slice(version.length + 1) })),
			sources
		) !== version
	)
		throw new Error('Dataset version/content mismatch');
	return {
		formatVersion: 1,
		version,
		...(previousVersion === undefined ? {} : { previousVersion }),
		builtAt: value.builtAt,
		files,
		sources,
		...(partitions === undefined ? {} : { partitions })
	};
}

/** Bound decoded response bytes, including chunked responses without Content-Length. */
async function boundedBody(response: Response, limit: number): Promise<Uint8Array> {
	const reader = response.body?.getReader();
	if (!reader) return new Uint8Array();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value.length > limit - size) {
				await reader.cancel();
				throw new Error(`Response exceeds byte limit (${limit})`);
			}
			chunks.push(value);
			size += value.length;
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	return bytes;
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
	const manifestText = new TextDecoder().decode(await boundedBody(response, 25 * 1024 * 1024));
	const manifest = validateManifest(JSON.parse(manifestText) as unknown);
	await mkdir(output, { recursive: true });
	const staging = resolve(output, `.pull-${randomUUID()}`);
	await mkdir(staging, { recursive: true });
	const download = async (manifest: Manifest, staging: string) => {
		await parallelEach(manifest.files, async (file) => {
			const response = await get(file.path);
			if (!response.ok) throw new Error(`${file.path}: HTTP ${response.status}`);
			const bytes = await boundedBody(response, file.bytes);
			if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256)
				throw new Error(`${file.path}: size/sha256 mismatch`);
			await atomicWrite(resolve(staging, file.path.slice(manifest.version.length + 1)), bytes);
		});
	};
	try {
		await download(manifest, staging);
		if (manifest.previousVersion) {
			const previousStaging = resolve(output, `.pull-${randomUUID()}`);
			try {
				const response = await get(`${manifest.previousVersion}/manifest.json`);
				if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
				const text = new TextDecoder().decode(await boundedBody(response, 25 * 1024 * 1024));
				const previous = validateManifest(JSON.parse(text) as unknown);
				if (previous.version !== manifest.previousVersion)
					throw new Error('Previous manifest version mismatch');
				await mkdir(previousStaging, { recursive: true });
				await download(previous, previousStaging);
				// Install verified history without activating it, sweeping versions or following older links.
				await publishDataset(output, previousStaging, previous, text, { activate: false });
			} catch (error) {
				console.warn(`Previous dataset ${manifest.previousVersion} unavailable: ${errorMessage(error)}`);
			} finally {
				await removeStaging(previousStaging);
			}
		}
		await publishDataset(output, staging, manifest, manifestText);
	} finally {
		await removeStaging(staging);
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
