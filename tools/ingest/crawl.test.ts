import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { crawl } from './crawl.ts';
import { cached, HttpCache } from './cache.ts';
import { DIRECTORY_URL, type CrawlSnapshot } from './common.ts';

// Retry backoff resolves immediately so persistent-failure cases stay fast.
vi.mock('node:timers/promises', () => ({ setTimeout: () => Promise.resolve() }));

const roots: string[] = [];
const href = (url: Parameters<typeof fetch>[0]) => (url instanceof Request ? url.url : url.toString());
afterEach(async () => {
	vi.unstubAllGlobals();
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(config = '') {
	const temp = resolve(homedir(), '.local/tmp');
	await mkdir(temp, { recursive: true });
	const root = await mkdtemp(resolve(temp, 'tonewave-crawl-test-'));
	roots.push(root);
	const paths = { root, cache: resolve(root, 'cache') };
	await mkdir(resolve(root, 'data'));
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
			JSON.stringify(
				['reviewer', 'other'].map((username) => ({
					username,
					name: username,
					urlType: 'subdomain',
					dbs: [{ type: 'IEMs', folder: '/' }]
				}))
			)
		]
	]);
	for (const username of ['reviewer', 'other']) {
		bodies.set(`https://${username}.squig.link/config.js`, config);
		bodies.set(
			`https://${username}.squig.link/data/phone_book.json`,
			JSON.stringify([{ name: 'Brand', phones: [{ name: 'Model', file: 'Model' }] }])
		);
	}
	const request = vi.fn<typeof fetch>().mockImplementation((url) => {
		const body = bodies.get(href(url));
		return Promise.resolve(body === undefined ? new Response(null, { status: 404 }) : new Response(body));
	});
	vi.stubGlobal('fetch', request);
	const snapshot = async () =>
		JSON.parse(await readFile(resolve(paths.cache, 'crawl.json'), 'utf8')) as CrawlSnapshot;
	return { paths, bodies, request, snapshot };
}

describe('crawl preflight', () => {
	it('discovers and caches the page config after root config.js returns 404', async () => {
		const { paths, bodies, request, snapshot } = await fixture();
		const base = 'https://reviewer.squig.link/';
		const configUrl = `${base}assets/js/config.js`;
		bodies.delete(`${base}config.js`);
		bodies.set(
			base,
			'<script src="assets/js/graphtool.js"></script><script src="assets/js/config.js"></script>'
		);
		bodies.set(configUrl, 'const DIR = "data/", default_channels = ["R"];');
		bodies.set(`${base}data/Model%20R.txt`, '20 70\n20000 80');
		await crawl(['--sites', 'reviewer'], paths);
		const urls = request.mock.calls.map(([url]) => href(url));
		expect(urls.indexOf(`${base}config.js`)).toBeLessThan(urls.indexOf(base));
		expect(urls.indexOf(base)).toBeLessThan(urls.indexOf(configUrl));
		expect(urls.filter((url) => url.endsWith('.txt'))).toEqual([`${base}data/Model%20R.txt`]);
		expect((await cached(configUrl, paths.cache))?.entry.status).toBe(200);
		expect((await snapshot()).errors).toEqual([]);
		expect((await snapshot()).excluded.filter(({ id }) => id.startsWith('reviewer-'))).toEqual([]);
	});
	it.each([true, false])(
		'prefers a linked page config over a stale root config (linked available: %s)',
		async (linkedAvailable) => {
			const { paths, bodies, request, snapshot } = await fixture(
				'const DIR = "data/", default_channels = ["R"];'
			);
			const base = 'https://reviewer.squig.link/';
			const configUrl = `${base}assets/js/config.js`;
			bodies.set(`${base}data/Model%20R.txt`, '20 70\n20000 80');
			await crawl(['--sites', 'reviewer'], paths);
			bodies.delete(`${base}config.js`);
			bodies.set(base, '<script src="assets/js/config.js"></script>');
			if (linkedAvailable) bodies.set(configUrl, 'const DIR = "data/", default_channels = ["R"];');
			request.mockClear();
			await crawl(['--sites', 'reviewer'], paths);
			const urls = request.mock.calls.map(([url]) => href(url));
			expect(urls).toContain(base);
			expect(urls).toContain(configUrl);
			expect((await cached(configUrl, paths.cache))?.entry.status).toBe(linkedAvailable ? 200 : 404);
			expect((await cached(`${base}config.js`, paths.cache))?.entry).toMatchObject({
				status: 200,
				lastFailure: { status: 404 }
			});
			expect((await snapshot()).errors.map(({ error }) => error)).toEqual(
				linkedAvailable ? [] : [expect.stringContaining(`Using last-good ${base}config.js`)]
			);
		}
	);
	it('keeps a stale root config when page discovery keeps failing', async () => {
		const { paths, bodies, request, snapshot } = await fixture(
			'const DIR = "data/", default_channels = ["R"];'
		);
		const base = 'https://reviewer.squig.link/';
		bodies.set(`${base}data/Model%20R.txt`, '20 70\n20000 80');
		await crawl(['--sites', 'reviewer'], paths);
		bodies.delete(`${base}config.js`);
		const answer = request.getMockImplementation();
		request.mockImplementation((url, init) =>
			href(url) === base
				? Promise.resolve(new Response(null, { status: 500 }))
				: (answer?.(url, init) ?? Promise.reject(new Error('no mock')))
		);
		await crawl(['--sites', 'reviewer'], paths);
		expect(request.mock.calls.some(([url]) => href(url) === base)).toBe(true);
		expect((await snapshot()).errors.map(({ error }) => error)).toEqual([
			expect.stringContaining(`Using last-good ${base}config.js`)
		]);
	});
	it('keeps a successful root config without requesting the index page', async () => {
		const { paths, request, snapshot } = await fixture();
		await crawl(['--sites', 'reviewer'], paths);
		expect(request.mock.calls.some(([url]) => href(url) === 'https://reviewer.squig.link/')).toBe(false);
		expect((await snapshot()).errors).toEqual([]);
	});
	it.each([
		null,
		'<script src="assets/js/graphtool.js"></script>',
		'<script src="assets/js/config.js"></script>'
	])('excludes a missing config before requesting measurements: %j', async (html) => {
		const { paths, bodies, request, snapshot } = await fixture();
		const base = 'https://reviewer.squig.link/';
		bodies.delete(`${base}config.js`);
		if (html !== null) bodies.set(base, html);
		await crawl(['--sites', 'reviewer'], paths);
		expect(request.mock.calls.some(([url]) => href(url).endsWith('.txt'))).toBe(false);
		expect((await snapshot()).errors[0]?.error).toContain('No successful config found');
	});
	it.each(['[]', '["A"]', '["L", "R", "C"]'])(
		'excludes unsupported channels %s before requesting measurements',
		async (channels) => {
			const { paths, request, snapshot } = await fixture(`default_channels = ${channels};`);
			await crawl(['--sites', 'reviewer'], paths);
			expect(request.mock.calls.some(([url]) => href(url).endsWith('.txt'))).toBe(false);
			expect((await snapshot()).errors[0]?.error).toContain('Unsupported channels');
		}
	);
	it('records missing calibration and skips measurement requests', async () => {
		const { paths, request, snapshot } = await fixture('measurement_calibration_file = "offset";');
		await crawl(['--sites', 'reviewer'], paths);
		expect(
			request.mock.calls.filter(([url]) => href(url).endsWith('.txt')).map(([url]) => href(url))
		).toEqual(['https://reviewer.squig.link/data/offset.txt']);
		expect((await snapshot()).errors[0]?.error).toContain('Configured calibration HTTP 404');
		expect((await snapshot()).excluded.some((entry) => entry.reason.includes('calibration HTTP 404'))).toBe(
			true
		);
	});
	it('retains a last-good calibration with an audit warning', async () => {
		const { paths, bodies, request, snapshot } = await fixture('measurement_calibration_file = "offset";');
		const url = 'https://reviewer.squig.link/data/offset.txt';
		bodies.set(url, '20 10\n20000 20');
		await new HttpCache(paths.cache).fetch(url);
		bodies.delete(url);
		await crawl(['--sites', 'reviewer'], paths);
		expect(request.mock.calls.some(([url]) => href(url).includes('Model%20L.txt'))).toBe(true);
		expect((await snapshot()).errors[0]?.error).toContain('Using last-good');
		expect((await snapshot()).retainedFailures).toEqual([expect.objectContaining({ url, status: 404 })]);
	});
	it('reports retained measurement failures in the snapshot and stdout summary', async () => {
		const { paths, bodies, snapshot } = await fixture();
		const url = 'https://reviewer.squig.link/data/Model%20L.txt';
		bodies.set(url, '20 70\n20000 80');
		await new HttpCache(paths.cache).fetch(url);
		bodies.delete(url);
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		try {
			await crawl(['--sites', 'reviewer'], paths);
			expect((await snapshot()).retainedFailures).toEqual([expect.objectContaining({ url, status: 404 })]);
			expect(log).toHaveBeenCalledWith(expect.stringContaining('1 retained failures'));
		} finally {
			log.mockRestore();
		}
	});
	it('trims comma-separated site selectors', async () => {
		const { paths, snapshot } = await fixture();
		await crawl(['--sites', 'reviewer, other '], paths);
		expect((await snapshot()).sources.map((db) => db.username)).toEqual(['reviewer', 'other']);
	});
	it.each(['typo', 'reviewer,', ''])(
		'rejects unknown or empty site %j without overwriting the crawl snapshot',
		async (sites) => {
			const { paths, request } = await fixture();
			await mkdir(paths.cache);
			const file = resolve(paths.cache, 'crawl.json');
			await writeFile(file, 'previous snapshot');
			await expect(crawl(['--sites', sites], paths)).rejects.toThrow('Unknown --sites entry');
			expect(await readFile(file, 'utf8')).toBe('previous snapshot');
			expect(request).toHaveBeenCalledTimes(1);
		}
	);
});
