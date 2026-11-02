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
import { datasetVersion, DIRECTORY_URL, ROOT, sha256 } from './common.ts';

const roots: string[] = [];
const base = 'https://reviewer.squig.link/';
const bookUrl = `${base}data/phone_book.json`;
const configUrl = `${base}config.js`;
const book = JSON.stringify([{ name: 'Brand', phones: [{ name: 'Model', file: 'Model' }] }]);
const config = 'const DIR = "data/", rig_description = "B&K 5128", measurement_calibration_file = "offset";';
const curve = (offset: number, shape = 0) =>
	[...GRID].map((hz, i) => `${hz} ${offset + Math.sin(i / 20) + shape * Math.cos(i / 15)}`).join('\n');

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
		switchIdentity: { moves: { kind: string; before: string; parent: string }[] };
		switchDefaults: {
			products: number;
			productSources: number;
			decisions: { product: string; preferred: string | null }[];
		};
		groupwiseMerges: {
			merged: number;
			groups: { productId: string; originalKeys: string[]; merged: number }[];
		};
		statistics: { partition: string; statistics: unknown }[];
		quality: {
			quarantine: { reason: string; file: string }[];
			forms: { file: string; before: string; after: string }[];
			ambiguousEqLabelsKeptAsTuning: { file: string; label: string }[];
			tuningModes: { file: string; kind: string; isDefault: boolean }[];
			defaultSelections: { name: string; index: number | null; file: string | null }[];
		};
		targets: ({ id: string } & ReferenceTarget['provenance'])[];
	};
	return { manifest, catalog, report };
}

describe('cached dataset build safety', () => {
	it('reconciles labelled switch defaults and split cable/state identities before statistics, without fetching', async () => {
		const names = ['reviewer', 'second', 'third', 'store', 'joyce', 'tipper'];
		const directory = names.map((username) => ({
			username,
			name: username,
			urlType: 'subdomain',
			dbs: [{ type: 'IEMs', folder: '/' }]
		}));
		const books = [
			[{ name: 'Softears', phones: [{ name: 'Volume S', file: ['High Impedance', 'Low Impedance'] }] }],
			[{ name: 'Softears', phones: [{ name: 'Volume S', file: ['Low Impedance', 'High Impedance'] }] }],
			[{ name: 'Softears', phones: [{ name: 'Volume S', file: ['Low Impedance'] }] }],
			[
				{
					name: 'Softears',
					phones: [
						{ name: 'Volume S High Imp', file: ['High Impedance'] },
						{ name: 'Volume S Low Imp', file: ['Low Impedance'] }
					]
				}
			],
			[{ name: 'Softears', phones: [{ name: 'Volume S (Standard 4.4mm)', file: ['standard cable'] }] }],
			[{ name: 'Softears', phones: [{ name: 'Volume S Stock Tip', file: ['stock tips'] }] }]
		];
		const bodies: [string, string][] = [[DIRECTORY_URL, JSON.stringify(directory)]];
		for (const [i, name] of names.entries()) {
			const url = `https://${name}.squig.link/`;
			const book = books[i];
			if (!book) throw new Error('Missing book fixture');
			bodies.push(
				[`${url}config.js`, 'rig_description="IEC 60318-4 711"'],
				[`${url}data/phone_book.json`, JSON.stringify(book)]
			);
			for (const file of book.flatMap((b) => b.phones.flatMap((p) => p.file)))
				bodies.push([
					`${url}data/${encodeURIComponent(file + ' L.txt')}`,
					curve(80, file.includes('High') ? 2 : 0)
				]);
		}
		const { paths } = await fixture('', bodies);
		const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('Build must not fetch'));
		vi.stubGlobal('fetch', request);
		await build(paths);
		const { catalog, report } = await result(paths);
		expect(request).not.toHaveBeenCalled();
		expect(catalog.products.map((p) => p.model)).toEqual(['Volume S']);
		expect(catalog.measurements).toHaveLength(9);
		expect(report.switchIdentity.moves.map((m) => m.kind).sort()).toEqual([
			'cable',
			'switch',
			'switch',
			'tip'
		]);
		expect(report.switchDefaults.decisions[0]?.preferred).toBe('impedance:low');
		for (const source of catalog.sources) {
			const defaults = catalog.measurements.filter((m) => m.sourceId === source.id && m.variant.isDefault);
			expect(defaults).toHaveLength(1);
			expect(defaults[0]?.variant.file).toBe(
				source.username === 'joyce'
					? 'standard cable'
					: source.username === 'tipper'
						? 'stock tips'
						: 'Low Impedance'
			);
		}
	});
	it('retains factory/uncertain EQ modes offline, selects stock defaults and reports uncertainty', async () => {
		const groups = [
			{
				name: 'Bowers and Wilkins',
				phones: [
					{
						name: 'Pi7 S2',
						file: ['Pi7S2 ANCOn', 'Pi7S2 ANCOff'],
						suffix: ['(Codec: APTX Adaptive, EQ: N/A, ANC: On)', '(Codec: APTX Adaptive, EQ: N/A, ANC: Off)']
					}
				]
			},
			{
				name: 'CMF by Nothing',
				phones: [
					{ name: 'CMF Buds Pro', file: ['CMF Buds Pro'], suffix: ['(Codec: AAC, EQ: Balanced, ANC: High)'] }
				]
			},
			{
				name: 'Qudelix',
				phones: [
					{
						name: 'QX Over',
						file: [
							'Qudelix QX Over',
							'Qudelix QX Over (Sunrise Neutral EQ)',
							'Qudelix QX Over (Oratory1990 EQ)'
						],
						suffix: []
					}
				]
			},
			{ name: 'Fixture', phones: [{ name: 'Mode only', file: ['Mode only EQ1'], suffix: [] }] },
			{
				name: 'Moondrop',
				phones: [
					{
						name: 'May',
						file: [
							'Moondrop May Harman',
							'Moondrop May Standard',
							'Moondrop May PEQ0',
							'Moondrop May (User EQ)'
						],
						suffix: ['(EQ: Harman)', '(EQ: Standard)', '(EQ: PEQ 0 Gain)', '(User EQ)']
					}
				]
			}
		];
		const bodies: [string, string][] = groups.flatMap((g) =>
			g.phones.flatMap((p) =>
				p.file.map((file, i): [string, string] => [
					`${base}data/${encodeURIComponent(file + ' L.txt')}`,
					curve(80, i)
				])
			)
		);
		const { paths } = await fixture('rig_description="B&K 5128"', [
			[bookUrl, JSON.stringify(groups)],
			...bodies
		]);
		const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('Build must not fetch'));
		vi.stubGlobal('fetch', request);
		await build(paths);
		const { catalog, report } = await result(paths);
		expect(request).not.toHaveBeenCalled();
		expect(catalog.products).toHaveLength(5);
		expect(catalog.measurements).toHaveLength(9);
		expect(
			catalog.measurements
				.filter((m) => m.variant.isDefault)
				.map((m) => m.variant.file)
				.sort()
		).toEqual(['CMF Buds Pro', 'Moondrop May Standard', 'Pi7S2 ANCOff', 'Qudelix QX Over']);
		for (const file of [
			'Pi7S2 ANCOn',
			'Moondrop May Harman',
			'Moondrop May PEQ0',
			'Qudelix QX Over (Sunrise Neutral EQ)',
			'Mode only EQ1'
		])
			expect(catalog.measurements.find((m) => m.variant.file === file)?.variant).toMatchObject({
				kind: 'tuning',
				isDefault: false
			});
		expect(report.quality.quarantine.map((q) => q.file).sort()).toEqual([
			'Moondrop May (User EQ)',
			'Qudelix QX Over (Oratory1990 EQ)'
		]);
		expect(report.quality.ambiguousEqLabelsKeptAsTuning.map((q) => q.file).sort()).toEqual([
			'Mode only EQ1',
			'Qudelix QX Over (Sunrise Neutral EQ)'
		]);
		expect(report.quality.defaultSelections).toContainEqual(
			expect.objectContaining({ name: 'Bowers and Wilkins Pi7 S2', index: 1, file: 'Pi7S2 ANCOff' })
		);
		expect(report.quality.tuningModes).toContainEqual(
			expect.objectContaining({ file: 'Moondrop May Harman', kind: 'tuning', isDefault: false })
		);
	});
	it('stops before publication when legitimate duplicate removal exceeds 3% of a 200-measurement partition', async () => {
		const phones = Array.from({ length: 200 }, (_, i) => ({ name: 'Model', file: `copy-${i}` }));
		const bodies: [string, string][] = phones.map((p) => [`${base}data/${p.file}%20L.txt`, curve(80)]);
		const { paths } = await fixture('rig_description="B&K 5128"', [
			[bookUrl, JSON.stringify([{ name: 'Maker', phones }])],
			...bodies
		]);
		await expect(build(paths)).rejects.toThrow('more than 3% legitimate duplicate defaults');
		await expect(stat(resolve(paths.output, 'manifest.json'))).rejects.toThrow('ENOENT');
		const blocked = JSON.parse(await readFile(resolve(paths.cache, 'quality-blocked.json'), 'utf8')) as {
			quarantineSummary: {
				legitimateDuplicateDefaults: number;
				legitimateDenominator: number;
				smallPartitionExempt: boolean;
			}[];
		};
		expect(blocked.quarantineSummary).toEqual([
			expect.objectContaining({
				legitimateDuplicateDefaults: 199,
				legitimateDenominator: 200,
				smallPartitionExempt: false
			})
		]);
	});
	it('publishes both forms from a mixed database, quarantines non-products and retains distinctly named mods', async () => {
		const entries = [
			{ name: 'AKG', phones: [{ name: 'K371', file: 'headphone' }] },
			{ name: 'Truthear', phones: [{ name: 'Hexa', file: 'iem' }] },
			{
				name: '*',
				phones: [
					{ name: 'FDX-SR (JVC HA-FDX1 mod)', file: 'mod' },
					{ name: 'Fake IE900', file: 'fake' }
				]
			},
			{ name: 'KZ', phones: [{ name: 'Unknown', file: 'unknown' }] },
			{ name: 'Average', phones: [{ name: 'IEM', file: 'average' }] },
			{ name: 'Ecoustic', phones: [{ name: 'EQ-100', file: 'Ecoustic EQ-100' }] },
			{
				name: 'Maker',
				phones: [
					{ name: 'Model', file: 'original' },
					{ name: 'Maker Model', file: 'copy' },
					{ name: 'Model + EQ', file: 'equalized' }
				]
			}
		];
		const bodies: [string, string][] = entries.flatMap((b) =>
			b.phones.flatMap((p) => [
				[`${base}data/${encodeURIComponent(p.file + ' L.txt')}`, curve(80)] as [string, string]
			])
		);
		const { paths } = await fixture('rig_description="B&K 5128"', [
			[bookUrl, JSON.stringify(entries)],
			...bodies
		]);
		const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('Build must not fetch'));
		vi.stubGlobal('fetch', request);
		await build(paths);
		const { catalog, manifest, report } = await result(paths);
		const hp = JSON.parse(
			gunzipSync(
				await readFile(resolve(paths.output, manifest.version, 'catalog-headphone.json.gz'))
			).toString()
		) as Catalog;
		expect(request).not.toHaveBeenCalled();
		expect(hp.products.map((p) => p.model)).toEqual(['K371']);
		expect(hp.measurements[0]?.partition).toBe('headphone-5128');
		expect(catalog.products.map((p) => p.model).sort()).toEqual([
			'EQ-100',
			'FDX-SR (JVC HA-FDX1 mod)',
			'Hexa',
			'Model'
		]);
		expect(report.quality.quarantine.map((q) => q.file).sort()).toEqual([
			'average',
			'copy',
			'equalized',
			'fake',
			'unknown'
		]);
		expect(report.quality.forms).toEqual([
			expect.objectContaining({ file: 'headphone', before: 'iem', after: 'headphone' })
		]);
		expect(catalog.sources[0]?.forms).toEqual(['headphone', 'iem']);
		expect(hp.sources[0]).toEqual(catalog.sources[0]);
		expect(manifest.sources[0]?.rigEvidence?.class).toBe('verified');
	});
	it('keeps an unknown rig visible in a source-specific partition', async () => {
		const { paths } = await fixture('rig_description="unidentified coupler"');
		await build(paths);
		const { catalog } = await result(paths);
		expect(catalog.measurements).toHaveLength(1);
		expect(catalog.partitions[0]?.id).toBe(`iem-source-${catalog.sources[0]?.id}`);
		expect(catalog.sources[0]?.rigEvidence).toMatchObject({ class: 'unknown', family: null });
	});
	it('builds from the cached page config after root config.js returns 404', async () => {
		const pageConfigUrl = `${base}assets/js/config.js`;
		const { paths, http } = await fixture(null, [
			[base, '<script src="assets/js/config.js"></script>'],
			[pageConfigUrl, config]
		]);
		vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })));
		await http.fetch(pageConfigUrl);
		const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('Build must not fetch'));
		vi.stubGlobal('fetch', request);
		await build(paths);
		const { manifest, catalog, report } = await result(paths);
		expect(request).not.toHaveBeenCalled();
		expect(catalog.measurements).toHaveLength(1);
		expect(catalog.sources[0]).toMatchObject({ rig: 'B&K 5128', partition: 'iem-5128' });
		expect(report.excluded).toEqual([]);
		expect(report.retainedFailures).toEqual([expect.objectContaining({ url: pageConfigUrl, status: 404 })]);
		const detailFile = catalog.measurements[0]?.detailFile;
		if (!detailFile) throw new Error('Missing fixture detail file');
		const detail = decodePack(
			gunzipSync(await readFile(resolve(paths.output, manifest.version, detailFile)))
		);
		expect(detail.curves[0]?.values[20]).toBe(70);
	});
	it('keeps a successful root config instead of using the cached index page', async () => {
		const { paths } = await fixture(config, [
			[base, '<script src="https://other.squig.link/config.js"></script>']
		]);
		await build(paths);
		const { catalog, report } = await result(paths);
		expect(catalog.measurements).toHaveLength(1);
		expect(report.excluded).toEqual([]);
	});
	it.each([true, false])(
		'prefers a cached linked config over a stale root config (linked available: %s)',
		async (linkedAvailable) => {
			const pageConfigUrl = `${base}assets/js/config.js`;
			const linkedConfig =
				'const DIR = "data/", rig_description = "IEC 60318-4 711", measurement_calibration_file = "offset";';
			const { paths, http } = await fixture(config, [
				[base, '<script src="assets/js/config.js"></script>'],
				...(linkedAvailable ? ([[pageConfigUrl, linkedConfig]] as [string, string][]) : [])
			]);
			vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })));
			await http.fetch(configUrl);
			if (!linkedAvailable) await http.fetch(pageConfigUrl);
			vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('Build must not fetch')));
			await build(paths);
			const { catalog, report } = await result(paths);
			expect(catalog.measurements).toHaveLength(1);
			expect(catalog.sources[0]?.partition).toBe(linkedAvailable ? 'iem-711' : 'iem-5128');
			expect(report.retainedFailures.some((failure) => failure.url === configUrl)).toBe(!linkedAvailable);
		}
	);
	it.each(['<script src="assets/js/graphtool.js"></script>', '<script src="assets/js/config.js"></script>'])(
		'excludes a source when the cached index has no available config: %s',
		async (html) => {
			const { paths } = await fixture(null, [[base, html]]);
			await build(paths);
			const { catalog, report } = await result(paths);
			expect(catalog.measurements).toEqual([]);
			expect(report.excluded[0]?.reason).toContain('No successful config found');
		}
	);
	it('reports an unsafe page config without aborting publication or fetching it', async () => {
		const { paths } = await fixture(null, [
			[base, '<script src="https://other.squig.link/config.js"></script>']
		]);
		const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('Build must not fetch'));
		vi.stubGlobal('fetch', request);
		await build(paths);
		const { catalog, report } = await result(paths);
		expect(request).not.toHaveBeenCalled();
		expect(catalog.measurements).toEqual([]);
		expect(report.excluded[0]?.reason).toContain('same-origin');
	});
	it('votes only accepted measurements, with global brand spelling and unchanged provenance', async () => {
		const { paths } = await fixture('', [
			[
				bookUrl,
				JSON.stringify([
					{
						name: 'BRAND',
						phones: [
							{ name: 'MODEL', file: 'Model' },
							{ name: 'MODEL', file: 'Missing' },
							{ name: 'MODEL', file: 'Missing' },
							{ name: 'MODEL', file: 'Missing' },
							{ name: 'MODEL', file: 'Model' }
						]
					},
					{
						name: 'Brand',
						phones: [
							{ name: 'Model', file: ['Model2', 'Model3'] },
							{ name: 'Other', file: 'Model4' }
						]
					}
				])
			],
			[`${base}data/Model2%20L.txt`, curve(80, 1)],
			[`${base}data/Model3%20L.txt`, curve(80)],
			[`${base}data/Model4%20L.txt`, curve(80)]
		]);
		await build(paths);
		const { catalog } = await result(paths);
		expect(catalog.products.map((p) => `${p.brand} ${p.model}`).sort()).toEqual([
			'Brand Model',
			'Brand Other'
		]);
		expect(catalog.measurements).toHaveLength(4);
		expect(catalog.measurements.map((m) => m.variant.file).sort()).toEqual([
			'Model',
			'Model2',
			'Model3',
			'Model4'
		]);
		expect(catalog.measurements.every((m) => m.provenance.originalUrls[0]?.startsWith(base))).toBe(true);
	});
	it('counts unique original keys and net reduction separately from groupwise merges when a key splits', async () => {
		const { paths } = await fixture('', [
			[
				bookUrl,
				JSON.stringify([
					{
						name: 'Brand',
						phones: [
							{ name: 'Model', file: 'Model' },
							{ name: 'Brand Model', file: 'Model2' },
							{ name: 'BrandModel', file: 'Model3' }
						]
					}
				])
			],
			[`${base}data/Model2%20L.txt`, curve(80, 1)],
			[`${base}data/Model3%20L.txt`, curve(80)]
		]);
		await build(paths);
		const { catalog, report } = await result(paths);
		expect(catalog.products).toHaveLength(2);
		expect(report.identityMerges).toEqual({ productsBefore: 2, productsAfter: 2, merged: 0 });
		expect(report.groupwiseMerges).toEqual({
			merged: 1,
			groups: [
				{
					productId: expect.any(String) as unknown,
					originalKeys: ['iem:brand:brandmodel', 'iem:brand:model'],
					merged: 1
				}
			]
		});
	});
	it('records successful target parse warnings in both the report and published target provenance', async () => {
		const { paths } = await fixture();
		const file = resolve(paths.root, 'data/targets/Harman in-ear 2019.csv');
		const bytes = `${await readFile(file, 'utf8')}\n20.00,7.61\nbroken row\n`;
		await writeFile(file, bytes);
		await build(paths);
		const { manifest, report } = await result(paths);
		const targets = JSON.parse(
			gunzipSync(await readFile(resolve(paths.output, manifest.version, 'targets.json.gz'))).toString()
		) as ReferenceTarget[];
		const expected = [
			'Dropped 1 malformed/nonfinite rows',
			'Sorted frequencies',
			'Merged 1 duplicate frequencies (dB mean)'
		];
		expect(targets[0]?.provenance.warnings).toEqual(expected);
		expect(report.targets[0]?.warnings).toEqual(expected);
		expect(report.targets[0]?.sha256).toBe(sha256(bytes));
		expect(report.targets[0]).toEqual({ id: targets[0]?.id, ...targets[0]?.provenance });
	});
	it('counts identity merges even when the same file/index becomes a duplicate measurement', async () => {
		const { paths } = await fixture('', [
			[
				bookUrl,
				JSON.stringify([
					{
						name: 'Brand',
						phones: [
							{ name: 'Model', file: 'Model' },
							{ name: 'Brand Model', file: 'Model' }
						]
					}
				])
			]
		]);
		await build(paths);
		const { catalog, report } = await result(paths);
		expect(catalog.measurements).toHaveLength(1);
		expect(report.identityMerges).toEqual({ productsBefore: 2, productsAfter: 1, merged: 1 });
	});
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
			[`${base}data/Model2%20L.txt`, curve(80, 1)],
			[`${base}data/Model3%20L.txt`, curve(80, 2)]
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
	it('combines maker and model aliases before identity but votes the original source spelling', async () => {
		const { paths } = await fixture('', [
			[
				bookUrl,
				JSON.stringify([
					{ name: 'Maker Acoustics', phones: [{ name: 'Model MEMS', file: 'Model' }] },
					{
						name: 'MAKER',
						phones: [
							{ name: 'MODEL', file: 'Model2' },
							{ name: 'MODEL', file: 'Model3' }
						]
					}
				])
			],
			[`${base}data/Model2%20L.txt`, curve(80, 1)],
			[`${base}data/Model3%20L.txt`, curve(80, 2)]
		]);
		await writeFile(
			resolve(paths.root, 'data/products.json'),
			JSON.stringify({
				brands: { 'Maker Acoustics': 'Maker' },
				aliases: { 'Maker Acoustics|Model MEMS': 'Maker|Model' }
			})
		);
		await build(paths);
		const { catalog } = await result(paths);
		expect(catalog.products).toHaveLength(1);
		// The source spelling with the most accepted measurements wins, not the alias target's spelling.
		expect(catalog.products[0]).toMatchObject({ brand: 'MAKER', model: 'MODEL' });
		expect(catalog.measurements).toHaveLength(3);
	});
	it.each([DIRECTORY_URL, `${base}data/offset.txt`, `${base}data/Model%20L.txt`])(
		'reports stale discovery/calibration/measurement %s',
		async (url) => {
			const { paths, http } = await fixture();
			vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })));
			await http.fetch(url);
			await build(paths);
			const { report, catalog } = await result(paths);
			expect(catalog.measurements).toHaveLength(1);
			expect(report.retainedFailures).toEqual([expect.objectContaining({ url, status: 404 })]);
			if (url === DIRECTORY_URL) expect(report.retainedFailures[0]).toMatchObject({ source: 'discovery' });
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
				reason:
					'No successful config found at config.js or in the index page; refusing rig/calibration defaults'
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
			JSON.stringify({
				overrides: { reviewer: { partition: 'custom-rig', rationale: 'Test custom partition' } }
			})
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
