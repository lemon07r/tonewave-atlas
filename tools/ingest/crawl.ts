import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { HttpCache, CrawlBlockedError, parallelEach } from './cache.ts';
import {
	atomicWrite,
	CACHE,
	calibrationUrl,
	fileChannels,
	configString,
	dataDirectory,
	DIRECTORY_URL,
	discover,
	errorMessage,
	readInputs,
	measurementUrl,
	OPT_OUT_URL,
	parseOptOuts,
	phoneBook,
	record,
	unwanted,
	type CrawlSnapshot
} from './common.ts';

export async function crawl(args = process.argv.slice(2)): Promise<void> {
	const { values } = parseArgs({ args, options: { limit: { type: 'string' }, sites: { type: 'string' } } });
	const limit = values.limit === undefined ? Infinity : Number(values.limit);
	if (!(limit > 0) || (Number.isFinite(limit) && !Number.isInteger(limit)))
		throw new Error('--limit must be a positive integer (variants per database)');
	const sites = values.sites?.split(',');
	const { excluded } = await readInputs();
	const http = new HttpCache();
	const [directory, script] = await Promise.all([http.fetch(DIRECTORY_URL), http.fetch(OPT_OUT_URL)]);
	if (
		directory.entry.status !== 200 ||
		script.entry.status !== 200 ||
		directory.entry.lastFailure ||
		script.entry.lastFailure
	)
		throw new Error('Live source discovery/opt-out retrieval failed');
	const optOuts = parseOptOuts(new TextDecoder().decode(script.body));
	const raw: unknown = JSON.parse(new TextDecoder().decode(directory.body));
	const snapshot: CrawlSnapshot = {
		startedAt: new Date().toISOString(),
		finishedAt: null,
		limited: Boolean(sites) || Number.isFinite(limit),
		sources: [],
		excluded: [],
		errors: []
	};
	// Keep an explicit audit of alternate-domain exclusions, even though discover never returns them.
	if (Array.isArray(raw))
		for (const site of raw as unknown[]) {
			if (record(site) && (site.urlType === 'altDomain' || site.username === 'crinacle'))
				snapshot.excluded.push({ id: String(site.username), reason: 'altDomain/crinacle' });
		}
	for (const db of discover(raw)) {
		const reason = optOuts.includes(db.username)
			? 'upstream opt-out'
			: excluded.sources.some((s) => [db.id, db.username, db.url].includes(s))
				? 'local exclusion'
				: db.dbType === 'Earbuds'
					? 'earbuds not supported'
					: sites && !sites.includes(db.username) && !sites.includes(db.id)
						? 'not selected'
						: null;
		if (reason) snapshot.excluded.push({ id: db.id, reason });
		else snapshot.sources.push(db);
	}
	const save = () => atomicWrite(resolve(CACHE, 'crawl.json'), JSON.stringify(snapshot, null, 2));
	await save();
	for (const [i, db] of snapshot.sources.entries()) {
		console.log(`[${i + 1}/${snapshot.sources.length}] ${db.id}: ${db.url}`);
		try {
			const [configResponse, bookResponse] = await Promise.all([
				http.fetch(new URL('config.js', db.url).href),
				http.fetch(new URL('data/phone_book.json', db.url).href)
			]);
			if (bookResponse.entry.status !== 200) throw new Error(`Phone book HTTP ${bookResponse.entry.status}`);
			if (configResponse.entry.status !== 200)
				throw new Error(
					'No successful config.js; source excluded rather than using rig/calibration defaults'
				);
			const config = new TextDecoder().decode(configResponse.body);
			for (const response of [configResponse, bookResponse])
				if (response.entry.lastFailure)
					snapshot.errors.push({
						id: db.id,
						error: `Using last-good ${response.entry.url}: ${response.entry.lastFailure.error}`
					});
			const dir = dataDirectory(db, config);
			const channels = fileChannels(config);
			if (!channels.length) throw new Error('Empty/unsupported default_channels');
			const cal = configString(config, 'measurement_calibration_file');
			if (cal) await http.fetch(calibrationUrl(dir, cal));
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
		`Crawl complete: ${snapshot.sources.length} databases selected, ${snapshot.excluded.length} excluded, ${snapshot.errors.length} issues. ${resolve(CACHE, 'crawl.json')}`
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	crawl().catch((e: unknown) => {
		console.error(errorMessage(e));
		process.exitCode = 1;
	});
}
