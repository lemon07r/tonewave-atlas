import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pull, validateManifest } from './pull.ts';
import { datasetVersion, sha256 } from './common.ts';

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
