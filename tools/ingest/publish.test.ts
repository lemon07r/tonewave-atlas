import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type { Manifest } from '#core/dataset/types.ts';
import { publishDataset } from './publish.ts';
import { sha256 } from './common.ts';

vi.mock('node:fs/promises', async (original) => {
	const fs = await original<typeof import('node:fs/promises')>();
	return { ...fs, rename: vi.fn(fs.rename), rm: vi.fn(fs.rm) };
});
const realFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
const roots: string[] = [];
const version = 'a'.repeat(24);
const payload = 'new complete dataset';
const manifest: Manifest = {
	formatVersion: 1,
	version,
	builtAt: '2026-11-02T00:00:00.000Z',
	sources: [],
	files: [
		{ path: `${version}/catalog-iem.json.gz`, bytes: Buffer.byteLength(payload), sha256: sha256(payload) }
	]
};
const text = JSON.stringify(manifest);

afterEach(async () => {
	vi.mocked(rename).mockReset();
	vi.mocked(rm).mockReset();
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
	const temp = resolve(homedir(), '.local/tmp');
	await mkdir(temp, { recursive: true });
	const output = await mkdtemp(resolve(temp, 'tonewave-publish-test-'));
	roots.push(output);
	const staging = resolve(output, '.staging'),
		target = resolve(output, version),
		backup = resolve(output, `.backup-${version}`);
	await mkdir(staging);
	await mkdir(target);
	await writeFile(resolve(staging, 'catalog-iem.json.gz'), payload);
	await writeFile(resolve(target, 'catalog-iem.json.gz'), 'old incomplete dataset');
	await writeFile(resolve(output, 'manifest.json'), 'old manifest');
	return { output, staging, target, backup };
}

describe('recoverable dataset publication', () => {
	it('repairs an incomplete version, publishes manifest last, then removes the backup', async () => {
		const f = await fixture();
		await publishDataset(f.output, f.staging, manifest, text);
		expect(await readFile(resolve(f.target, 'catalog-iem.json.gz'), 'utf8')).toBe(payload);
		expect(await readFile(resolve(f.output, 'manifest.json'), 'utf8')).toBe(text);
		expect(await readdir(f.output)).toEqual(['manifest.json', version].sort());
	});
	it('preserves a same-version directory and file inodes when hashes match', async () => {
		const f = await fixture();
		await writeFile(resolve(f.target, 'catalog-iem.json.gz'), payload);
		const before = await stat(resolve(f.target, 'catalog-iem.json.gz'));
		await publishDataset(f.output, f.staging, manifest, text);
		expect((await stat(resolve(f.target, 'catalog-iem.json.gz'))).ino).toBe(before.ino);
		expect(vi.mocked(rename).mock.calls.every(([from]) => from !== f.target)).toBe(true);
	});
	it('restores the old target if installing staging fails after the backup rename', async () => {
		const f = await fixture();
		vi.mocked(rename).mockImplementation((from, to) =>
			from === f.staging ? Promise.reject(new Error('interrupted install')) : realFs.rename(from, to)
		);
		await expect(publishDataset(f.output, f.staging, manifest, text)).rejects.toThrow('interrupted install');
		expect(await readFile(resolve(f.target, 'catalog-iem.json.gz'), 'utf8')).toBe('old incomplete dataset');
		expect(await readFile(resolve(f.output, 'manifest.json'), 'utf8')).toBe('old manifest');
		await expect(stat(f.backup)).rejects.toThrow();
	});
	it('rolls back an installed repair if atomic manifest replacement fails', async () => {
		const f = await fixture();
		vi.mocked(rename).mockImplementation((from, to) =>
			to === resolve(f.output, 'manifest.json')
				? Promise.reject(new Error('manifest interrupted'))
				: realFs.rename(from, to)
		);
		await expect(publishDataset(f.output, f.staging, manifest, text)).rejects.toThrow('manifest interrupted');
		expect(await readFile(resolve(f.target, 'catalog-iem.json.gz'), 'utf8')).toBe('old incomplete dataset');
		expect(await readFile(resolve(f.output, 'manifest.json'), 'utf8')).toBe('old manifest');
		await expect(stat(f.staging)).rejects.toThrow();
		expect(await readdir(f.output)).toEqual(['manifest.json', version].sort());
	});
	it('recovers a prior process interruption with only the backup left', async () => {
		const f = await fixture();
		await rename(f.target, f.backup);
		await publishDataset(f.output, f.staging, manifest, text);
		expect(await readFile(resolve(f.target, 'catalog-iem.json.gz'), 'utf8')).toBe(payload);
		expect(await readFile(resolve(f.output, 'manifest.json'), 'utf8')).toBe(text);
		await expect(stat(f.backup)).rejects.toThrow();
	});
	it('finishes a prior process interruption after staging was installed but before the manifest', async () => {
		const f = await fixture();
		await rename(f.target, f.backup);
		await rename(f.staging, f.target);
		const inode = (await stat(f.target)).ino;
		await publishDataset(f.output, f.staging, manifest, text);
		expect((await stat(f.target)).ino).toBe(inode);
		expect(await readFile(resolve(f.output, 'manifest.json'), 'utf8')).toBe(text);
		await expect(stat(f.backup)).rejects.toThrow();
	});
	it('removes an obsolete same-version backup on manifest failure when the live target is verified', async () => {
		const f = await fixture();
		await rename(f.target, f.backup);
		await writeFile(resolve(f.staging, 'catalog-iem.json.gz'), payload);
		await rename(f.staging, f.target);
		vi.mocked(rename).mockImplementation((from, to) =>
			to === resolve(f.output, 'manifest.json')
				? Promise.reject(new Error('manifest interrupted'))
				: realFs.rename(from, to)
		);
		await expect(publishDataset(f.output, f.staging, manifest, text)).rejects.toThrow('manifest interrupted');
		expect(await readFile(resolve(f.target, 'catalog-iem.json.gz'), 'utf8')).toBe(payload);
		expect(await readdir(f.output)).toEqual(['manifest.json', version].sort());
	});
	it('rejects corrupt staging without renaming the live target', async () => {
		const f = await fixture();
		await writeFile(resolve(f.staging, 'catalog-iem.json.gz'), 'corrupt');
		const before = (await stat(f.target)).ino;
		await expect(publishDataset(f.output, f.staging, manifest, text)).rejects.toThrow('does not match');
		expect((await stat(f.target)).ino).toBe(before);
		expect(await readFile(resolve(f.output, 'manifest.json'), 'utf8')).toBe('old manifest');
		await expect(stat(f.staging)).rejects.toThrow();
	});
	it.each([true, false])('sweeps interrupted scratch directories on success=%s', async (success) => {
		const f = await fixture();
		for (const name of ['.build-old', '.pull-old', `.backup-${'b'.repeat(24)}`, '.interrupted-old']) {
			await mkdir(resolve(f.output, name));
			await writeFile(resolve(f.output, name, 'partial'), 'not for deployment');
		}
		if (!success) await writeFile(resolve(f.staging, 'catalog-iem.json.gz'), 'corrupt');
		if (success) await publishDataset(f.output, f.staging, manifest, text);
		else await expect(publishDataset(f.output, f.staging, manifest, text)).rejects.toThrow('does not match');
		expect(await readdir(f.output)).toEqual(['manifest.json', version].sort());
	});
	it('logs cleanup errors without failing an already committed publication', async () => {
		const f = await fixture();
		await mkdir(resolve(f.output, '.build-old'));
		vi.mocked(rm).mockImplementation((path, options) =>
			path === resolve(f.output, '.build-old')
				? Promise.reject(new Error('cleanup denied'))
				: realFs.rm(path, options)
		);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			await expect(publishDataset(f.output, f.staging, manifest, text)).resolves.toBeUndefined();
			expect(await readFile(resolve(f.output, 'manifest.json'), 'utf8')).toBe(text);
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('cleanup denied'));
		} finally {
			warn.mockRestore();
		}
	});
});
