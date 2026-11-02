import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { HttpCache, CrawlBlockedError, parallelEach } from './cache.ts';
import {
	atomicWrite,
	CACHE,
	calibrationUrl,
	fileChannels,
	configScriptUrl,
	configString,
	dataDirectory,
	DIRECTORY_URL,
	discover,
	errorMessage,
	readInputs,
	measurementUrl,
	phoneBook,
	record,
	ROOT,
	supportedChannels,
	unwanted,
	type CrawlSnapshot
} from './common.ts';

export async function crawl(
	args = process.argv.slice(2),
	paths = { root: ROOT, cache: CACHE }
): Promise<void> {
	const { values } = parseArgs({ args, options: { limit: { type: 'string' }, sites: { type: 'string' } } });
	const limit = values.limit === undefined ? Infinity : Number(values.limit);
	if (!(limit > 0) || (Number.isFinite(limit) && !Number.isInteger(limit)))
		throw new Error('--limit must be a positive integer (variants per database)');
	const sites = values.sites?.split(',').map((site) => site.trim());
	const { excluded } = await readInputs(paths.root);
	const http = new HttpCache(paths.cache);
	const directory = await http.fetch(DIRECTORY_URL);
	if (directory.entry.status !== 200 || directory.entry.lastFailure)
		throw new Error('Live source discovery failed');
	const raw: unknown = JSON.parse(new TextDecoder().decode(directory.body));
	const databases = discover(raw);
	for (const site of sites ?? [])
		if (!site || !databases.some((db) => db.username === site || db.id === site))
			throw new Error(`Unknown --sites entry: ${JSON.stringify(site)}`);
	const snapshot: CrawlSnapshot = {
		startedAt: new Date().toISOString(),
		finishedAt: null,
		limited: Boolean(sites) || Number.isFinite(limit),
		retainedFailures: [],
		sources: [],
		excluded: [],
		errors: []
	};
	const retained = (id: string, response: Awaited<ReturnType<HttpCache['fetch']>>) => {
		if (response.entry.status !== 200 || !response.entry.lastFailure) return;
		snapshot.retainedFailures?.push({ id, url: response.entry.url, ...response.entry.lastFailure });
		snapshot.errors.push({
			id,
			error: `Using last-good ${response.entry.url}: ${response.entry.lastFailure.error}`
		});
	};
	// Keep an explicit audit of alternate-domain exclusions, even though discover never returns them.
	if (Array.isArray(raw))
		for (const site of raw as unknown[]) {
			if (record(site) && (site.urlType === 'altDomain' || site.username === 'crinacle'))
				snapshot.excluded.push({ id: String(site.username), reason: 'altDomain/crinacle' });
		}
	for (const db of databases) {
		const reason = excluded.sources.some((s) => [db.id, db.username, db.url].includes(s))
			? 'local exclusion'
			: db.dbType === 'Earbuds'
				? 'earbuds not supported'
				: sites && !sites.includes(db.username) && !sites.includes(db.id)
					? 'not selected'
					: null;
		if (reason) snapshot.excluded.push({ id: db.id, reason });
		else snapshot.sources.push(db);
	}
	const save = () => atomicWrite(resolve(paths.cache, 'crawl.json'), JSON.stringify(snapshot, null, 2));
	await save();
	for (const [i, db] of snapshot.sources.entries()) {
		console.log(`[${i + 1}/${snapshot.sources.length}] ${db.id}: ${db.url}`);
		try {
			const [rootConfigResponse, bookResponse] = await Promise.all([
				http.fetch(new URL('config.js', db.url).href),
				http.fetch(new URL('data/phone_book.json', db.url).href)
			]);
			if (bookResponse.entry.status !== 200) throw new Error(`Phone book HTTP ${bookResponse.entry.status}`);
			// A root config that now fails keeps its last-good body (status 200 plus lastFailure), so a
			// stale root still triggers page discovery and is used only if no linked config succeeds.
			let configResponse = rootConfigResponse;
			if (configResponse.entry.status !== 200 || configResponse.entry.lastFailure) {
				try {
					const pageResponse = await http.fetch(db.url);
					if (pageResponse.entry.status === 200) {
						retained(db.id, pageResponse);
						const configUrl = configScriptUrl(new TextDecoder().decode(pageResponse.body), db.url);
						if (configUrl) {
							const linked = await http.fetch(configUrl);
							if (linked.entry.status === 200) configResponse = linked;
						}
					}
				} catch (e) {
					if (rootConfigResponse.entry.status !== 200) throw e;
				}
			}
			if (configResponse.entry.status !== 200)
				throw new Error(
					'No successful config found at config.js or in the index page; source excluded rather than using rig/calibration defaults'
				);
			const config = new TextDecoder().decode(configResponse.body);
			for (const response of [configResponse, bookResponse]) retained(db.id, response);
			const dir = dataDirectory(db, config);
			supportedChannels(config);
			const channels = fileChannels(config);
			const cal = configString(config, 'measurement_calibration_file');
			if (cal) {
				const response = await http.fetch(calibrationUrl(dir, cal));
				if (response.entry.status !== 200)
					throw new Error(`Configured calibration HTTP ${response.entry.status}; source excluded`);
				retained(db.id, response);
			}
			const book = phoneBook(
				JSON.parse(new TextDecoder().decode(bookResponse.body).replace(/^\uFEFF/, '')) as unknown
			);
			for (const warning of book.warnings) snapshot.errors.push({ id: db.id, error: warning });
			const files = [
				...new Set(
					book.phones.flatMap((p) =>
						excluded.products.includes(`${p.brand} ${p.name}`) || unwanted(`${p.brand} ${p.name}`)
							? []
							: p.file.filter((f) => !unwanted(f) && !excluded.files.includes(f))
					)
				)
			].slice(0, limit);
			const urls = files
				.flatMap((file) => channels.map((channel) => measurementUrl(dir, file, channel)))
				.filter((url) => !excluded.files.includes(url));
			let done = 0;
			let missing = 0;
			await parallelEach(urls, async (url) => {
				try {
					const response = await http.fetch(url);
					retained(db.id, response);
					if (response.entry.status !== 200) missing++;
				} catch (e) {
					if (e instanceof CrawlBlockedError) throw e;
					snapshot.errors.push({ id: db.id, error: `${url}: ${errorMessage(e)}` });
				}
				done++;
				if (done % 200 === 0) console.log(`  ${done}/${urls.length} channel files; ${missing} HTTP failures`);
			});
			console.log(
				`  done ${done} channel files (${missing} HTTP failures), ${book.phones.length} phone entries`
			);
		} catch (e) {
			snapshot.errors.push({ id: db.id, error: errorMessage(e) });
			snapshot.excluded.push({ id: db.id, reason: errorMessage(e) });
			await save();
			if (e instanceof CrawlBlockedError) throw e;
			console.warn(`  skipped: ${errorMessage(e)}`);
		}
		await save();
	}
	snapshot.finishedAt = new Date().toISOString();
	await save();
	console.log(
		`Crawl complete: ${snapshot.sources.length} databases selected, ${snapshot.excluded.length} excluded, ${snapshot.errors.length} issues, ${snapshot.retainedFailures?.length ?? 0} retained failures. ${resolve(paths.cache, 'crawl.json')}`
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	crawl().catch((e: unknown) => {
		console.error(errorMessage(e));
		process.exitCode = 1;
	});
}
