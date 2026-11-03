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
	it('keeps the version from the previous manifest, then rotates it out on the next version', async () => {
		const f = await fixture();
		const previous = 'b'.repeat(24),
			older = 'd'.repeat(24),
			next = 'c'.repeat(24);
		for (const name of [previous, older]) {
			await mkdir(resolve(f.output, name));
			await writeFile(resolve(f.output, name, 'catalog-iem.json.gz'), `retained ${name}`);
		}
		await writeFile(resolve(f.output, 'manifest.json'), JSON.stringify({ ...manifest, version: previous }));
		await publishDataset(f.output, f.staging, manifest, text);
		expect(await readdir(f.output)).toEqual(['manifest.json', version, previous].sort());
		expect(await readFile(resolve(f.output, previous, 'catalog-iem.json.gz'), 'utf8')).toBe(
			`retained ${previous}`
		);
		await mkdir(f.staging);
		await writeFile(resolve(f.staging, 'catalog-iem.json.gz'), payload);
		const nextManifest = {
			...manifest,
			version: next,
			files: manifest.files.map((file) => ({ ...file, path: file.path.replace(version, next) }))
		};
		await publishDataset(f.output, f.staging, nextManifest, JSON.stringify(nextManifest));
		expect(await readdir(f.output)).toEqual(['manifest.json', version, next].sort());
		expect(await readFile(resolve(f.output, version, 'catalog-iem.json.gz'), 'utf8')).toBe(payload);
	});
	it('keeps every existing version when publication fails', async () => {
		const f = await fixture();
		for (const name of ['b'.repeat(24), 'c'.repeat(24)]) await mkdir(resolve(f.output, name));
		await writeFile(
			resolve(f.output, 'manifest.json'),
			JSON.stringify({ ...manifest, version: 'b'.repeat(24) })
		);
		await writeFile(resolve(f.staging, 'catalog-iem.json.gz'), 'corrupt');
		await expect(publishDataset(f.output, f.staging, manifest, text)).rejects.toThrow('does not match');
		expect(await readdir(f.output)).toEqual(
			['manifest.json', version, 'b'.repeat(24), 'c'.repeat(24)].sort()
		);
	});
	it('preserves retained history when publishing the same version again', async () => {
		const f = await fixture();
		const previous = 'b'.repeat(24);
		await mkdir(resolve(f.output, previous));
		await writeFile(resolve(f.output, 'manifest.json'), JSON.stringify({ ...manifest, version: previous }));
		await publishDataset(f.output, f.staging, manifest, text);
		await mkdir(f.staging);
		await writeFile(resolve(f.staging, 'catalog-iem.json.gz'), payload);
		await publishDataset(f.output, f.staging, manifest, text);
		expect(await readdir(f.output)).toEqual(['manifest.json', version, previous].sort());
	});
	it.each([null, { version: '../not-a-version' }])(
		'publishes safely without a valid previous version: %s',
		async (previous) => {
			const f = await fixture();
			const older = 'b'.repeat(24);
			await mkdir(resolve(f.output, older));
			if (previous) await writeFile(resolve(f.output, 'manifest.json'), JSON.stringify(previous));
			else await rm(resolve(f.output, 'manifest.json'));
			await publishDataset(f.output, f.staging, manifest, text);
			expect(await readdir(f.output)).toEqual(['manifest.json', version].sort());
		}
	);
	it.each([true, false])('preserves matching regular files during sweep (success=%s)', async (success) => {
		const f = await fixture();
		const names = [
			'.build-not-a-directory',
			'.pull-not-a-directory',
			'.backup-not-a-directory',
			'.interrupted-not-a-directory',
			'd'.repeat(24)
		];
		for (const name of names) await writeFile(resolve(f.output, name), 'keep this file');
		if (!success) await writeFile(resolve(f.staging, 'catalog-iem.json.gz'), 'corrupt');
		if (success) await publishDataset(f.output, f.staging, manifest, text);
		else await expect(publishDataset(f.output, f.staging, manifest, text)).rejects.toThrow('does not match');
		for (const name of names) expect(await readFile(resolve(f.output, name), 'utf8')).toBe('keep this file');
	});
	it('preserves every backup when a different-version publication fails, including the live manifest recovery copy', async () => {
		const f = await fixture();
		const liveVersion = 'b'.repeat(24),
			otherVersion = 'c'.repeat(24);
		const liveBackup = resolve(f.output, `.backup-${liveVersion}`);
		const otherBackup = resolve(f.output, `.backup-${otherVersion}`);
		for (const dir of [liveBackup, otherBackup]) {
			await mkdir(dir);
			await writeFile(resolve(dir, 'catalog-iem.json.gz'), 'recoverable dataset');
		}
		const oldManifest = JSON.stringify({ ...manifest, version: liveVersion });
		await writeFile(resolve(f.output, 'manifest.json'), oldManifest);
		await writeFile(resolve(f.staging, 'catalog-iem.json.gz'), 'corrupt');
		await expect(publishDataset(f.output, f.staging, manifest, text)).rejects.toThrow('does not match');
		expect(await readFile(resolve(f.output, 'manifest.json'), 'utf8')).toBe(oldManifest);
		for (const dir of [liveBackup, otherBackup])
			expect(await readFile(resolve(dir, 'catalog-iem.json.gz'), 'utf8')).toBe('recoverable dataset');
		await expect(stat(f.staging)).rejects.toThrow();
	});
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
	it('retains even a same-version backup when manifest publication fails with a verified target', async () => {
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
		expect(await readFile(resolve(f.backup, 'catalog-iem.json.gz'), 'utf8')).toBe('old incomplete dataset');
		expect(await readdir(f.output)).toEqual([`.backup-${version}`, 'manifest.json', version].sort());
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
		expect(await readdir(f.output)).toEqual(
			(success ? ['manifest.json', version] : [`.backup-${'b'.repeat(24)}`, 'manifest.json', version]).sort()
		);
	});
	it('does not sweep the live manifest recovery backup if the manifest changed after commit', async () => {
		const f = await fixture(),
			liveVersion = 'b'.repeat(24);
		const backup = resolve(f.output, `.backup-${liveVersion}`);
		await mkdir(backup);
		await writeFile(resolve(backup, 'catalog-iem.json.gz'), 'last live data');
		vi.mocked(rename).mockImplementation(async (from, to) => {
			await realFs.rename(from, to);
			if (to === resolve(f.output, 'manifest.json'))
				await writeFile(to, JSON.stringify({ version: liveVersion }));
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			await publishDataset(f.output, f.staging, manifest, text);
			expect(await readFile(resolve(backup, 'catalog-iem.json.gz'), 'utf8')).toBe('last live data');
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('preserving backups'));
		} finally {
			warn.mockRestore();
		}
	});
	it('preserves a backup needed by changed live file metadata even when its version string is unchanged', async () => {
		const f = await fixture();
		await mkdir(f.backup);
		await writeFile(resolve(f.backup, 'required-old-file'), 'last live data');
		vi.mocked(rename).mockImplementation(async (from, to) => {
			await realFs.rename(from, to);
			if (to === resolve(f.output, 'manifest.json'))
				await writeFile(
					to,
					JSON.stringify({
						...manifest,
						files: [{ ...manifest.files[0], path: `${version}/required-old-file` }]
					})
				);
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			await publishDataset(f.output, f.staging, manifest, text);
			expect(await readFile(resolve(f.backup, 'required-old-file'), 'utf8')).toBe('last live data');
		} finally {
			warn.mockRestore();
		}
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
