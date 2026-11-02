import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pull, validateManifest } from './pull.ts';
import { datasetVersion, sha256 } from './common.ts';
import { sourceFor } from './transform.ts';

const bytes = new TextEncoder().encode('test payload');
const file = { path: 'catalog-iem.json.gz', bytes: bytes.length, sha256: sha256(bytes) };
const version = datasetVersion([file], []);
const manifest = {
	formatVersion: 1,
	version,
	builtAt: '2026-11-02T00:00:00.000Z',
	sources: [],
	files: [{ path: `${version}/catalog-iem.json.gz`, bytes: bytes.length, sha256: sha256(bytes) }]
};
const roots: string[] = [];
afterEach(async () => {
	vi.unstubAllGlobals();
	await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function output(): Promise<string> {
	const base = resolve(homedir(), '.local/tmp');
	await mkdir(base, { recursive: true });
	const dir = await mkdtemp(resolve(base, 'tonewave-pull-test-'));
	roots.push(dir);
	return dir;
}

describe('dataset pull', () => {
	it('hashes and preserves additive rig evidence and mixed-form metadata without changing older versions', () => {
		const s = sourceFor(
			{
				id: 'fixture',
				username: 'fixture',
				name: 'Fixture',
				url: 'https://fixture.invalid/',
				dbType: '5128'
			},
			'',
			'date',
			{}
		);
		s.forms = ['iem', 'headphone'];
		s.partitions = ['iem-5128', 'headphone-5128'];
		const legacy = { ...s };
		delete legacy.rigEvidence;
		delete legacy.forms;
		delete legacy.partitions;
		for (const field of ['rigEvidence', 'forms', 'partitions'] as const) {
			const bearing = { ...s };
			if (field !== 'rigEvidence') delete bearing.rigEvidence;
			if (field !== 'forms') delete bearing.forms;
			if (field !== 'partitions') delete bearing.partitions;
			expect(datasetVersion([file], [bearing])).not.toBe(datasetVersion([file], [legacy]));
		}
		const v = datasetVersion([file], [s]);
		const m = { ...manifest, version: v, sources: [s], files: [{ ...file, path: `${v}/${file.path}` }] };
		expect(validateManifest(m).sources).toEqual([s]);
		const invalidSource = { ...s, rigEvidence: { ...s.rigEvidence, class: ['verified'] } };
		expect(() => validateManifest({ ...m, sources: [invalidSource] })).toThrow('Invalid rig evidence');
		expect(() =>
			validateManifest({ ...m, sources: [{ ...s, rigEvidence: { ...s.rigEvidence, projection: 'bad' } }] })
		).toThrow('rig evidence statistic');
		expect(() => validateManifest({ ...m, sources: [{ ...s, forms: ['earbud'] }] })).toThrow('source forms');
		expect(() => validateManifest({ ...m, sources: [{ ...s, partitions: ['../bad'] }] })).toThrow(
			'source partitions'
		);
	});
	it('accepts a content-verified targets artifact', () => {
		const target = { ...file, path: 'targets.json.gz' };
		const version = datasetVersion([target], []);
		expect(
			validateManifest({ ...manifest, version, files: [{ ...target, path: `${version}/${target.path}` }] })
				.files[0]?.path
		).toBe(`${version}/targets.json.gz`);
	});
	it('downloads a manifest-driven dataset and verifies bytes before publication', async () => {
		const dir = await output();
		vi.stubGlobal(
			'fetch',
			vi
				.fn<typeof fetch>()
				.mockImplementation((url) =>
					Promise.resolve(
						new Response(
							(url instanceof Request ? url.url : url.toString()).endsWith('manifest.json')
								? JSON.stringify(manifest)
								: bytes
						)
					)
				)
		);
		await pull('https://dataset.invalid/data/', dir);
		expect(await readFile(resolve(dir, version, 'catalog-iem.json.gz'))).toEqual(Buffer.from(bytes));
		expect(JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8')) as unknown).toEqual(manifest);
		const inode = (await stat(resolve(dir, version))).ino;
		await pull('https://dataset.invalid/data/', dir);
		expect((await stat(resolve(dir, version))).ino).toBe(inode);
	});
	it('does not publish or retain staging files when a checksum fails', async () => {
		const dir = await output();
		vi.stubGlobal(
			'fetch',
			vi
				.fn<typeof fetch>()
				.mockImplementation((url) =>
					Promise.resolve(
						new Response(
							(url instanceof Request ? url.url : url.toString()).endsWith('manifest.json')
								? JSON.stringify(manifest)
								: 'corrupt'
						)
					)
				)
		);
		await expect(pull('https://dataset.invalid/data/', dir)).rejects.toThrow('size/sha256');
		expect(await readdir(dir)).toEqual([]);
	});
	it.each([
		'../secret',
		`${version}/../secret`,
		`${version}/catalog-iem.json.gz?x`,
		`https://evil.invalid/catalog-iem.json.gz`
	])('rejects unsafe manifest paths: %s', (path) => {
		expect(() => validateManifest({ ...manifest, files: [{ ...manifest.files[0], path }] })).toThrow(
			'Invalid dataset file'
		);
	});
	it('rejects a version label that does not hash the normalized content', () => {
		const otherVersion = 'a'.repeat(24);
		expect(() =>
			validateManifest({
				...manifest,
				version: otherVersion,
				files: [{ ...file, path: `${otherVersion}/${file.path}` }]
			})
		).toThrow('version/content mismatch');
		expect(() =>
			validateManifest({ ...manifest, files: [{ ...manifest.files[0], sha256: 'b'.repeat(64) }] })
		).toThrow('version/content mismatch');
	});
	it.each(['manifest', 'artifact'])('cancels an oversized chunked %s before publication', async (kind) => {
		const dir = await output();
		const limit = kind === 'manifest' ? 25 * 1024 * 1024 : bytes.length;
		const cancel = vi.fn();
		let chunks = 0;
		const stream = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					chunks++;
					controller.enqueue(new Uint8Array(chunks === 1 ? limit : 1));
				},
				cancel
			},
			{ highWaterMark: 0 }
		);
		vi.stubGlobal(
			'fetch',
			vi.fn<typeof fetch>().mockImplementation((url) => {
				const isManifest = (url instanceof Request ? url.url : url.toString()).endsWith('manifest.json');
				return Promise.resolve(
					new Response(isManifest && kind !== 'manifest' ? JSON.stringify(manifest) : stream)
				);
			})
		);
		await expect(pull('https://dataset.invalid/data/', dir)).rejects.toThrow('Response exceeds byte limit');
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(chunks).toBe(2);
		expect(await readdir(dir)).toEqual([]);
	});
});
