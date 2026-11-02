import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pull, validateManifest } from './pull.ts';
import { sha256 } from './common.ts';

const version = 'a'.repeat(24);
const bytes = new TextEncoder().encode('test payload');
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
});
