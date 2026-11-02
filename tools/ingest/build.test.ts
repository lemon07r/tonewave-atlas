import { afterEach, describe, expect, it, vi } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Catalog, Manifest, ReferenceTarget } from '#core/dataset/types.ts';
import { decodePack } from '#core/dataset/codec.ts';
import { GRID } from '#core/grid.ts';
import { build } from './build.ts';
import { HttpCache } from './cache.ts';
import { datasetVersion, DIRECTORY_URL, OPT_OUT_URL, ROOT } from './common.ts';

const roots: string[] = [];
const base = 'https://reviewer.squig.link/';
const bookUrl = `${base}data/phone_book.json`;
const configUrl = `${base}config.js`;
const book = JSON.stringify([{ name: 'Brand', phones: [{ name: 'Model', file: 'Model' }] }]);
const config = 'const DIR = "data/", rig_description = "B&K 5128", measurement_calibration_file = "offset";';
const curve = (offset: number) => [...GRID].map((hz, i) => `${hz} ${offset + Math.sin(i / 20)}`).join('\n');

afterEach(async () => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(configBody: string | null = config, extraBodies: [string, string][] = []) {
	const temp = resolve(homedir(), '.local/tmp');
	await mkdir(temp, { recursive: true });
	const root = await mkdtemp(resolve(temp, 'tonewave-build-test-'));
	roots.push(root);
	const paths = { root, cache: resolve(root, 'cache'), output: resolve(root, 'output') };
	await mkdir(resolve(root, 'data'));
	await cp(resolve(ROOT, 'data/targets'), resolve(root, 'data/targets'), { recursive: true });
	for (const [name, value] of Object.entries({
		exclusions: { sources: [], files: [], products: [] },
		aliases: { brands: {} },
		products: { aliases: {} },
		sources: { overrides: {} }
	}))
		await writeFile(resolve(root, `data/${name}.json`), JSON.stringify(value));
	const bodies = new Map([
		[
			DIRECTORY_URL,
			JSON.stringify([
				{ username: 'reviewer', name: 'Reviewer', urlType: 'subdomain', dbs: [{ type: 'IEMs', folder: '/' }] }
			])
		],
		[OPT_OUT_URL, 'let optedOut = [];'],
		[bookUrl, book],
		[`${base}data/offset.txt`, curve(10)],
		[`${base}data/Model%20L.txt`, curve(80)],
		[`${base}data/Model%20R.txt`, curve(80)]
	]);
	if (configBody !== null) bodies.set(configUrl, configBody);
	for (const [url, body] of extraBodies) bodies.set(url, body);
	vi.stubGlobal(
		'fetch',
		vi.fn<typeof fetch>().mockImplementation((url) => {
			const body = bodies.get(url instanceof Request ? url.url : url.toString());
			return Promise.resolve(
				body === undefined
					? new Response(null, { status: 404 })
					: new Response(body, { headers: { etag: '"good"' } })
			);
		})
	);
	const http = new HttpCache(paths.cache);
	for (const url of [...bodies.keys(), ...(configBody === null ? [configUrl] : [])]) await http.fetch(url);
	return { paths, http };
}

async function result(paths: { cache: string; output: string }) {
	const manifest = JSON.parse(await readFile(resolve(paths.output, 'manifest.json'), 'utf8')) as Manifest;
	const catalog = JSON.parse(
		gunzipSync(await readFile(resolve(paths.output, manifest.version, 'catalog-iem.json.gz'))).toString()
	) as Catalog;
	const report = JSON.parse(await readFile(resolve(paths.cache, 'report.json'), 'utf8')) as {
		excluded: { reason: string }[];
		issues: { reason: string }[];
		retainedFailures: { url: string; status: number | null }[];
		identityMerges: { merged: number; productsBefore: number; productsAfter: number };
		statistics: { partition: string; statistics: unknown }[];
	};
	return { manifest, catalog, report };
}

describe('cached dataset build safety', () => {
	it('reports actual brand-prefix and explicit alias product merges', async () => {
		const { paths } = await fixture('', [
			[
				bookUrl,
				JSON.stringify([
					{
						name: 'Brand',
						phones: [
							{ name: 'Model', file: 'Model' },
							{ name: 'Brand Model', file: 'Model2' },
							{ name: 'Model II', file: 'Model3' }
						]
					}
				])
			],
			[`${base}data/Model2%20L.txt`, curve(80)],
			[`${base}data/Model3%20L.txt`, curve(80)]
		]);
		await writeFile(
			resolve(paths.root, 'data/products.json'),
			JSON.stringify({ aliases: { 'Brand|Model II': 'Brand|Model' } })
		);
		await build(paths);
		const { catalog, report } = await result(paths);
		expect(catalog.products).toHaveLength(1);
		expect(catalog.measurements).toHaveLength(3);
		expect(report.identityMerges).toEqual({ productsBefore: 3, productsAfter: 1, merged: 2 });
	});
	it.each([`${base}data/offset.txt`, `${base}data/Model%20L.txt`])(
		'reports stale calibration/measurement %s',
		async (url) => {
			const { paths, http } = await fixture();
			vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })));
			await http.fetch(url);
			await build(paths);
			const { report, catalog } = await result(paths);
			expect(catalog.measurements).toHaveLength(1);
			expect(report.retainedFailures).toEqual([expect.objectContaining({ url, status: 404 })]);
			expect(report.issues.some((issue) => issue.reason.includes('last-good'))).toBe(true);
		}
	);
	it.each([configUrl, bookUrl])(
		'retains calibration and partition after a last-good %s later 404s',
		async (url) => {
			const { paths, http } = await fixture();
			vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })));
			await http.fetch(url);
			await build(paths);
			const { manifest, catalog, report } = await result(paths);
			expect(catalog.measurements).toHaveLength(1);
			expect(catalog.partitions[0]?.id).toBe('iem-5128');
			expect(report.issues.some((issue) => issue.reason.includes('last-good'))).toBe(true);
			const detailFile = catalog.measurements[0]?.detailFile;
			if (!detailFile) throw new Error('Missing fixture detail file');
			const detail = decodePack(
				gunzipSync(await readFile(resolve(paths.output, manifest.version, detailFile)))
			);
			// Both curves contain sin(i/20), so subtraction independently gives exactly 70 dB.
			expect(detail.curves[0]?.values[20]).toBe(70);
		}
	);
	it('reports and excludes a cached phone book/curves with no successful configuration', async () => {
		const { paths } = await fixture(null);
		await build(paths);
		const { catalog, report } = await result(paths);
		expect(catalog.measurements).toEqual([]);
		expect(report.excluded).toEqual([
			{
				id: expect.any(String) as unknown,
				reason: 'No successful config.js; refusing rig/calibration defaults'
			}
		]);
	});
	it.each([
		'DIR = "http://127.0.0.1/private/";',
		'measurement_calibration_file = "https://other.squig.link/cal";'
	])('reports and excludes unsafe configuration paths: %s', async (unsafe) => {
		const { paths } = await fixture(unsafe);
		await build(paths);
		const { catalog, report } = await result(paths);
		expect(catalog.measurements).toEqual([]);
		expect(report.excluded[0]?.reason).toContain('same-origin');
	});
	it('keeps the same verified version directory on repeat builds', async () => {
		const { paths } = await fixture();
		await build(paths);
		const before = await result(paths);
		const inode = (await stat(resolve(paths.output, before.manifest.version))).ino;
		await build(paths);
		expect((await result(paths)).manifest).toEqual(before.manifest);
		expect((await stat(resolve(paths.output, before.manifest.version))).ino).toBe(inode);
		const rankFile = before.catalog.partitions[0]?.rankFile;
		if (!rankFile) throw new Error('Missing rank file');
		const rank = decodePack(
			gunzipSync(await readFile(resolve(paths.output, before.manifest.version, rankFile)))
		);
		expect(rank.statistics).toEqual(before.catalog.partitions[0]?.statistics);
		expect(rank.statistics?.support?.status).toBe('low');
		expect(before.report.statistics[0]?.statistics).toEqual(rank.statistics);
		expect(before.manifest.files.some((f) => f.path === `${before.manifest.version}/targets.json.gz`)).toBe(
			true
		);
		const targets = JSON.parse(
			gunzipSync(await readFile(resolve(paths.output, before.manifest.version, 'targets.json.gz'))).toString()
		) as ReferenceTarget[];
		expect(targets.map((t) => t.id)).toEqual(['harman-in-ear-2019', 'diffuse-field-5128']);
		expect(
			datasetVersion(
				before.manifest.files.map((f) => ({ ...f, path: f.path.slice(before.manifest.version.length + 1) })),
				before.manifest.sources
			)
		).toBe(before.manifest.version);
	});
	it('reports an unsafe derived partition without aborting publication', async () => {
		const { paths } = await fixture('', [
			[
				DIRECTORY_URL,
				JSON.stringify([
					{
						username: 'reviewer',
						name: 'Reviewer',
						urlType: 'subdomain',
						dbs: [{ type: 'Headphones_unsafe', folder: '/' }]
					}
				])
			]
		]);
		await writeFile(
			resolve(paths.root, 'data/sources.json'),
			JSON.stringify({ overrides: { reviewer: { form: 'headphone' } } })
		);
		await build(paths);
		const { catalog, report } = await result(paths);
		expect(catalog.measurements).toEqual([]);
		expect(report.excluded[0]?.reason).toContain('Unsafe partition id');
	});
	it.each(['default_channels = [];', 'default_channels = ["A"];', 'default_channels = ["L", "R", "C"];'])(
		'reports unsupported channels: %s',
		async (config) => {
			const { paths } = await fixture(config);
			await build(paths);
			const { catalog, report } = await result(paths);
			expect(catalog.measurements).toEqual([]);
			expect(report.excluded[0]?.reason).toContain('Unsupported channels');
		}
	);
	it('excludes a calibration entirely outside the canonical grid', async () => {
		const { paths } = await fixture(config, [[`${base}data/offset.txt`, '1 10\n2 20']]);
		await build(paths);
		const { catalog, report } = await result(paths);
		expect(catalog.measurements).toEqual([]);
		expect(report.excluded[0]?.reason).toContain('calibration missing/invalid');
	});
	it('retains a custom IEM partition in its actual form catalog', async () => {
		const { paths } = await fixture();
		await writeFile(
			resolve(paths.root, 'data/sources.json'),
			JSON.stringify({ overrides: { reviewer: { partition: 'custom-rig' } } })
		);
		await build(paths);
		const { catalog } = await result(paths);
		expect(catalog.partitions[0]).toMatchObject({ id: 'custom-rig', form: 'iem', measurementCount: 1 });
		expect(catalog.measurements[0]?.partition).toBe('custom-rig');
	});
	it('accepts dense raw measurements without spreading them as call arguments', async () => {
		const dense = Array.from({ length: 200000 }, (_, i) => `${20 + i / 10} ${80 + Math.sin(i / 1000)}`).join(
			'\n'
		);
		const { paths } = await fixture('', [[`${base}data/Model%20L.txt`, dense]]);
		await build(paths);
		const { catalog } = await result(paths);
		expect(catalog.measurements[0]?.channels).toContain('L');
	});
	it.each(['exclusions', 'aliases', 'sources', 'products'])(
		'fails before publishing when %s.json is malformed',
		async (name) => {
			const { paths } = await fixture();
			await writeFile(resolve(paths.root, `data/${name}.json`), JSON.stringify({ typo: [] }));
			await expect(build(paths)).rejects.toThrow('Invalid');
			await expect(readFile(resolve(paths.output, 'manifest.json'))).rejects.toThrow();
		}
	);
});
