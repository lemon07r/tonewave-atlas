import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { GRID_SIZE, RANK_SIZE, RANK_STEP } from '#core/grid.ts';
import { smoothOctave } from '#core/smooth.ts';
import { encodePack, type CurvePack, type PackedCurve } from '#core/dataset/codec.ts';
import type {
	Catalog,
	DatasetFile,
	Manifest,
	Measurement,
	Partition,
	PartitionStatistics,
	Product,
	Source
} from '#core/dataset/types.ts';
import { parseMeasurement } from '#core/measurement/parse.ts';
import { averageChannels, resample } from '#core/measurement/resample.ts';
import { cached } from './cache.ts';
import {
	atomicWrite,
	CACHE,
	calibrationUrl,
	configScriptUrl,
	supportedChannels,
	fileChannels,
	dataDirectory,
	datasetVersion,
	DIRECTORY_URL,
	discover,
	errorMessage,
	readInputs,
	measurementUrl,
	OUTPUT,
	phoneBook,
	record,
	ROOT,
	sha256,
	unwanted
} from './common.ts';
import {
	collisionGroups,
	DisplayNames,
	identity,
	normalise,
	sourceFor,
	suspiciousNames,
	usdPrice,
	variant
} from './transform.ts';
import { publishDataset, removeStaging } from './publish.ts';
import { medianSpreadByBand, rankStatistics } from './statistics.ts';
import { referenceTargets } from './targets.ts';

export interface PartitionCurve {
	measurement: Measurement;
	channels: PackedCurve[];
	rank: PackedCurve;
}

/** Engine integration on default, product-balanced rank curves; support is always explicit. */
export function computePartitionStatistics(curves: readonly PartitionCurve[]): PartitionStatistics {
	return rankStatistics(curves);
}

export function compressPack(pack: CurvePack): {
	bytes: Uint8Array;
	layout: string;
	curveMajorBytes: number;
	frequencyMajorBytes: number;
} {
	const curve = gzipSync(encodePack(pack, 'curve-major'), { level: 9 });
	const frequency = gzipSync(encodePack(pack, 'frequency-major'), { level: 9 });
	return {
		bytes: curve.length <= frequency.length ? curve : frequency,
		layout: curve.length <= frequency.length ? 'curve-major' : 'frequency-major',
		curveMajorBytes: curve.length,
		frequencyMajorBytes: frequency.length
	};
}

interface SourceCount {
	phones: number;
	variants: number;
	accepted: number;
	rejected: number;
	missingChannels: number;
	uncachedVariants: number;
	reasons: Record<string, number>;
}

export async function build(paths = { root: ROOT, cache: CACHE, output: OUTPUT }): Promise<void> {
	const { excluded, brands, overrides, productAliases } = await readInputs(paths.root);
	const targets = await referenceTargets(paths.root);
	const directory = await cached(DIRECTORY_URL, paths.cache);
	if (directory?.entry.status !== 200) throw new Error('Run data:crawl first (source directory required)');
	const aliases: Record<string, string> = {};
	for (const [a, b] of Object.entries(brands)) {
		aliases[normalise(a)] = b;
		aliases[normalise(b)] = b;
	}
	const products = new Map<string, Product>();
	const displayNames = new DisplayNames();
	const identities = new Map<string, Set<string>>();
	const originalIdentities = new Map<string, Set<string>>();
	const trackIdentity = (product: ReturnType<typeof identity>, originalName: string) => {
		const names = identities.get(product.id) ?? new Set<string>();
		names.add(originalName);
		identities.set(product.id, names);
		const originals = originalIdentities.get(product.id) ?? new Set<string>();
		originals.add(product.originalKey);
		originalIdentities.set(product.id, originals);
	};
	const unmatchedBrands = new Set<string>();
	const sources: Source[] = [];
	const partitions = new Map<string, PartitionCurve[]>();
	const acceptedIds = new Set<string>();
	const report = {
		targets: targets.map(({ id, provenance }) => ({ id, ...provenance })),
		counts: {} as Record<string, SourceCount>,
		excluded: [] as { id: string; reason: string }[],
		issues: [] as { source: string; file: string; reason: string }[],
		retainedFailures: [] as {
			source: string;
			url: string;
			status: number | null;
			at: string;
			error: string;
		}[],
		layouts: [] as { file: string; layout: string; curveMajorBytes: number; frequencyMajorBytes: number }[],
		statistics: [] as {
			partition: string;
			statistics: PartitionStatistics;
			medianSpreadByBand: Record<string, number | null>;
		}[]
	};
	let builtAt = directory.entry.fetchedAt;
	const useTime = (time: string) => {
		if (time > builtAt) builtAt = time;
	};
	const retained = (source: string, response: NonNullable<Awaited<ReturnType<typeof cached>>>) => {
		if (!response.entry.lastFailure) return;
		report.retainedFailures.push({ source, url: response.entry.url, ...response.entry.lastFailure });
		report.issues.push({
			source,
			file: response.entry.url,
			reason: `Using last-good cached response: ${response.entry.lastFailure.error}`
		});
	};
	retained('discovery', directory);
	const raw: unknown = JSON.parse(new TextDecoder().decode(directory.body));
	if (Array.isArray(raw))
		for (const site of raw as unknown[]) {
			if (record(site) && (site.urlType === 'altDomain' || site.username === 'crinacle'))
				report.excluded.push({ id: String(site.username), reason: 'altDomain/crinacle' });
		}
	const databases = discover(raw).sort((a, b) => a.id.localeCompare(b.id, 'en'));
	for (const db of databases) {
		const why = excluded.sources.some((s) => [db.id, db.username, db.url].includes(s))
			? 'local exclusion'
			: db.dbType === 'Earbuds'
				? 'earbuds not supported'
				: null;
		if (why) {
			report.excluded.push({ id: db.id, reason: why });
			continue;
		}
		const bookCache = await cached(new URL('data/phone_book.json', db.url).href, paths.cache);
		if (bookCache?.entry.status !== 200) {
			report.excluded.push({ id: db.id, reason: 'phone book not cached/available' });
			continue;
		}
		useTime(bookCache.entry.fetchedAt);
		let configCache = await cached(new URL('config.js', db.url).href, paths.cache);
		if (configCache?.entry.status !== 200 || configCache.entry.lastFailure) {
			const pageCache = await cached(db.url, paths.cache);
			if (pageCache?.entry.status === 200) {
				useTime(pageCache.entry.fetchedAt);
				retained(db.id, pageCache);
				let configUrl: string | null;
				try {
					configUrl = configScriptUrl(new TextDecoder().decode(pageCache.body), db.url);
				} catch (e) {
					report.excluded.push({ id: db.id, reason: errorMessage(e) });
					continue;
				}
				if (configUrl) {
					const linked = await cached(configUrl, paths.cache);
					if (linked?.entry.status === 200) configCache = linked;
				}
			}
		}
		if (configCache?.entry.status !== 200) {
			report.excluded.push({
				id: db.id,
				reason:
					'No successful config found at config.js or in the index page; refusing rig/calibration defaults'
			});
			continue;
		}
		const config = new TextDecoder().decode(configCache.body);
		useTime(configCache.entry.fetchedAt);
		for (const response of [configCache, bookCache]) retained(db.id, response);
		const counts: SourceCount = {
			phones: 0,
			variants: 0,
			accepted: 0,
			rejected: 0,
			missingChannels: 0,
			uncachedVariants: 0,
			reasons: {}
		};
		report.counts[db.id] = counts;
		const reject = (file: string, reason: string) => {
			counts.rejected++;
			counts.reasons[reason] = (counts.reasons[reason] ?? 0) + 1;
			report.issues.push({ source: db.id, file, reason });
		};
		let dir: string;
		let calUrl: string | null;
		let source: Source;
		let channels: string[];
		try {
			source = sourceFor(db, config, bookCache.entry.fetchedAt, overrides[db.url] ?? overrides[db.username]);
			supportedChannels(config);
			channels = fileChannels(config);
			dir = dataDirectory(db, config);
			calUrl = source.calibration ? calibrationUrl(dir, source.calibration) : null;
		} catch (e) {
			report.excluded.push({ id: db.id, reason: errorMessage(e) });
			continue;
		}
		// The live squig graphtool subtracts measurement_calibration_file from measurements (not targets).
		let calibration: Float64Array | null = null;
		if (calUrl) {
			const c = await cached(calUrl, paths.cache);
			if (c?.entry.status === 200) {
				retained(db.id, c);
				const p = parseMeasurement(new TextDecoder().decode(c.body), {
					minPoints: 2,
					maxStartHz: Infinity,
					minEndHz: 0
				});
				if (p.ok) {
					const values = resample(p.points);
					if (values.some(Number.isFinite)) {
						calibration = values;
						useTime(c.entry.fetchedAt);
					}
				}
			}
			if (!calibration) {
				report.excluded.push({
					id: db.id,
					reason: 'Configured calibration missing/invalid; refusing uncalibrated publication'
				});
				continue;
			}
		}
		let book;
		try {
			book = phoneBook(
				JSON.parse(new TextDecoder().decode(bookCache.body).replace(/^\uFEFF/, '')) as unknown
			);
		} catch (e) {
			report.excluded.push({ id: db.id, reason: errorMessage(e) });
			continue;
		}
		for (const warning of book.warnings) report.issues.push({ source: db.id, file: '', reason: warning });
		counts.phones = book.phones.length;
		for (const phone of book.phones) {
			for (const [index, file] of phone.file.entries()) {
				counts.variants++;
				if (unwanted(`${phone.brand} ${phone.name} ${file}`)) {
					reject(file, 'target/EQ/calibration name');
					continue;
				}
				if (excluded.products.includes(`${phone.brand} ${phone.name}`) || excluded.files.includes(file)) {
					reject(file, 'local exclusion');
					continue;
				}
				const product = identity(phone.brand, phone.name, source.form, aliases, productAliases);
				const id = `m-${sha256(`${db.id}\0${product.id}\0${file}\0${index}`).slice(0, 20)}`;
				if (acceptedIds.has(id)) {
					trackIdentity(product, `${phone.brand} ${phone.name}`);
					reject(file, 'duplicate normalised identity/file/index; first accepted entry retained');
					continue;
				}
				const curves: PackedCurve[] = [];
				const warnings: string[] = [];
				const dated: Record<string, string | null> = {};
				const lastModified: Record<string, string | null> = {};
				const urls: string[] = [];
				let attempted = false;
				for (const channel of channels) {
					const url = measurementUrl(dir, file, channel);
					if (excluded.files.includes(url)) continue;
					const response = await cached(url, paths.cache);
					if (!response) continue;
					attempted = true;
					if (response.entry.status !== 200) {
						counts.missingChannels++;
						continue;
					}
					useTime(response.entry.fetchedAt);
					retained(db.id, response);
					if (response.entry.lastFailure)
						warnings.push(
							`${channel}: using last-good cached body after ${response.entry.lastFailure.error}`
						);
					const parsed = parseMeasurement(new TextDecoder().decode(response.body));
					if (!parsed.ok) {
						report.issues.push({ source: db.id, file: `${file} ${channel}`, reason: parsed.error });
						warnings.push(`${channel}: ${parsed.error}`);
						continue;
					}
					let low = Infinity,
						high = -Infinity;
					for (const db of parsed.points.db) {
						low = Math.min(low, db);
						high = Math.max(high, db);
					}
					if (high - low < 0.05 || high - low > 100) {
						warnings.push(`${channel}: ${high - low < 0.05 ? 'flat line' : 'absurd dynamic range'}`);
						continue;
					}
					const values = resample(parsed.points);
					if (calibration)
						for (let i = 0; i < values.length; i++) {
							const cal = calibration[i] ?? NaN;
							if (Number.isFinite(cal)) values[i] = (values[i] ?? NaN) - cal;
						}
					const finite = values.filter(Number.isFinite);
					if (
						finite.length < 16 ||
						Math.max(...finite) - Math.min(...finite) > 100 ||
						Math.min(...finite) < -200 ||
						Math.max(...finite) > 200
					) {
						warnings.push(`${channel}: invalid calibrated range`);
						continue;
					}
					curves.push({ measurementId: id, channel, values });
					dated[channel] = parsed.points.dated;
					lastModified[channel] = response.entry.lastModified;
					urls.push(url);
					warnings.push(...parsed.warnings.map((w) => `${channel}: ${w}`));
				}
				if (!curves.length) {
					if (!attempted) counts.uncachedVariants++;
					else reject(file, warnings.length ? warnings.join('; ') : 'no valid channels (HTTP failures)');
					continue;
				}
				const channelMean = (pattern: RegExp): Float64Array | null => {
					const selected = curves.filter((c) => pattern.test(c.channel));
					if (!selected.length) return null;
					return Float64Array.from({ length: GRID_SIZE }, (_, i) => {
						const values = selected.map((c) => c.values[i] ?? NaN).filter(Number.isFinite);
						return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : NaN;
					});
				};
				const left = channelMean(/^(?:L\d*|\d*)$/);
				const right = channelMean(/^R\d*$/);
				const avg = averageChannels(left, right);
				const smooth = smoothOctave(avg.values, 12);
				const rank = Float64Array.from({ length: RANK_SIZE }, (_, i) => smooth[i * RANK_STEP] ?? NaN);
				const measurement: Measurement = {
					id,
					productId: product.id,
					sourceId: source.id,
					partition: source.partition,
					variant: variant(phone, index, id),
					channels: curves.map((c) => c.channel),
					channelContributions: [...avg.contributions],
					imbalanceDb: avg.imbalanceDb,
					pairedBins: avg.pairedBins,
					dated,
					lastModified,
					price:
						phone.price === null
							? null
							: {
									raw: phone.price,
									usd: usdPrice(phone.price),
									sourceId: source.id,
									crawledAt: source.crawledAt
								},
					reviewUrl: phone.reviewLink && /^https?:\/\//i.test(phone.reviewLink) ? phone.reviewLink : null,
					detailFile: '',
					provenance: {
						sourceId: source.id,
						databaseUrl: db.url,
						originalUrls: urls,
						calibrationUrl: calUrl,
						processing: [
							'parse/sort/duplicate-frequency dB mean; ignore phase',
							'log-frequency linear interpolation on 240-point 1/24-oct GRID; no extrapolation',
							...(calibration
								? [
										'subtract configured measurement calibration in dB (no correction outside calibration coverage)'
									]
								: []),
							...(channels.some((c) => /\d$/.test(c))
								? [
										'rank/imbalance only: finite dB mean of numbered repetitions within each channel; detail retains every repetition'
									]
								: []),
							'rank only: channel dB mean (available channel outside overlap), Gaussian 1/12-oct smoothing, every second GRID point',
							'codec v1: nearest 0.02 dB int16; NaN sentinel'
						]
					},
					warnings
				};
				let p = products.get(product.id);
				if (!p) {
					p = {
						id: product.id,
						brand: product.brand,
						model: product.model,
						form: source.form,
						measurementIds: []
					};
					products.set(p.id, p);
				}
				p.measurementIds.push(id);
				displayNames.observe(product);
				trackIdentity(product, `${phone.brand} ${phone.name}`);
				if (!aliases[normalise(phone.brand)]) unmatchedBrands.add(phone.brand);
				const group = partitions.get(source.partition) ?? [];
				group.push({
					measurement,
					channels: curves,
					rank: { measurementId: id, channel: 'avg', values: rank }
				});
				partitions.set(source.partition, group);
				acceptedIds.add(id);
				counts.accepted++;
			}
		}
		if (counts.accepted) sources.push(source);
		else report.excluded.push({ id: db.id, reason: 'no accepted curves in cache' });
		console.log(
			`${db.id}: ${counts.accepted} accepted / ${counts.rejected} rejected; ${counts.missingChannels} missing channels`
		);
	}
	displayNames.apply(products.values());
	const artifacts = new Map<string, Uint8Array>();
	artifacts.set('targets.json.gz', gzipSync(JSON.stringify(targets), { level: 9 }));
	const partitionMetadata: Partition[] = [];
	for (const [id, curves] of [...partitions].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
		curves.sort(
			(a, b) =>
				a.measurement.productId.localeCompare(b.measurement.productId, 'en') ||
				a.measurement.id.localeCompare(b.measurement.id, 'en')
		);
		const stats = computePartitionStatistics(curves);
		const bands = medianSpreadByBand(stats);
		report.statistics.push({ partition: id, statistics: stats, medianSpreadByBand: bands });
		console.log(
			`Statistics ${id}: ${stats.support?.multiSourceProducts ?? 0} multi-source products (${stats.support?.status ?? 'unknown'}); median spread dB ${JSON.stringify(bands)}; harmonisation ${JSON.stringify(stats.harmonisation)}`
		);
		const rankFile = `rank-${id}.bin.gz`;
		const rank = compressPack({
			kind: 'rank',
			partition: id,
			points: RANK_SIZE,
			curves: curves.map((c) => c.rank),
			statistics: stats
		});
		artifacts.set(rankFile, rank.bytes);
		report.layouts.push({
			file: rankFile,
			layout: rank.layout,
			curveMajorBytes: rank.curveMajorBytes,
			frequencyMajorBytes: rank.frequencyMajorBytes
		});
		const detailFiles: string[] = [];
		// Product groups are indivisible so a product never needs several shards in the same partition.
		const groups = new Map<string, PartitionCurve[]>();
		for (const c of curves) {
			const g = groups.get(c.measurement.productId) ?? [];
			g.push(c);
			groups.set(c.measurement.productId, g);
		}
		let batch: PartitionCurve[] = [];
		const flush = () => {
			if (!batch.length) return;
			const name = `detail-${id}-${detailFiles.length}.bin.gz`;
			const compressed = compressPack({
				kind: 'detail',
				partition: id,
				points: GRID_SIZE,
				curves: batch.flatMap((c) => c.channels),
				statistics: null
			});
			artifacts.set(name, compressed.bytes);
			report.layouts.push({
				file: name,
				layout: compressed.layout,
				curveMajorBytes: compressed.curveMajorBytes,
				frequencyMajorBytes: compressed.frequencyMajorBytes
			});
			detailFiles.push(name);
			for (const c of batch) c.measurement.detailFile = name;
			batch = [];
		};
		let estimate = 0;
		for (const group of groups.values()) {
			batch.push(...group);
			estimate += group.reduce((n, c) => n + c.channels.length * GRID_SIZE * 2, 0);
			// Check actual compressed bytes after roughly one uncompressed shard, then every ~50 KB.
			if (estimate >= 240000) {
				const size = compressPack({
					kind: 'detail',
					partition: id,
					points: GRID_SIZE,
					curves: batch.flatMap((c) => c.channels),
					statistics: null
				}).bytes.length;
				if (size >= 190000) {
					flush();
					estimate = 0;
				} else estimate = 190000;
			}
		}
		flush();
		const product = products.get(curves[0]?.measurement.productId ?? '');
		if (!product) throw new Error(`Missing product for partition ${id}`);
		partitionMetadata.push({
			id,
			form: product.form,
			measurementCount: curves.length,
			rankFile,
			detailFiles,
			statistics: stats
		});
	}
	const sortedProducts = [...products.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'));
	const productsBefore = new Set([...originalIdentities.values()].flatMap((ids) => [...ids])).size;
	const identityMergeGroups = [...originalIdentities]
		.filter(([, ids]) => ids.size > 1)
		.map(([productId, ids]) => ({ productId, originalKeys: [...ids].sort(), merged: ids.size - 1 }))
		.sort((a, b) => a.productId.localeCompare(b.productId, 'en'));
	const groupwiseMerges = {
		merged: identityMergeGroups.reduce((n, group) => n + group.merged, 0),
		groups: identityMergeGroups
	};
	const remainingCollisionGroups = collisionGroups(sortedProducts);
	const identityMerges = {
		productsBefore,
		productsAfter: products.size,
		merged: productsBefore - products.size
	};
	for (const p of sortedProducts) p.measurementIds.sort();
	for (const form of ['iem', 'headphone'] as const) {
		const catalog: Catalog = {
			formatVersion: 1,
			form,
			products: sortedProducts.filter((p) => p.form === form),
			measurements: [...partitions.values()]
				.flatMap((cs) => cs.map((c) => c.measurement))
				.filter((m) => products.get(m.productId)?.form === form)
				.sort((a, b) => a.id.localeCompare(b.id, 'en')),
			sources: sources.filter((s) => s.form === form),
			partitions: partitionMetadata.filter((p) => p.form === form)
		};
		artifacts.set(`catalog-${form}.json.gz`, gzipSync(JSON.stringify(catalog), { level: 9 }));
	}
	const files = [...artifacts]
		.sort(([a], [b]) => a.localeCompare(b, 'en'))
		.map(([path, bytes]): DatasetFile => ({ path, bytes: bytes.length, sha256: sha256(bytes) }));
	if (files.length >= 19000 || files.some((f) => f.bytes >= 25 * 1024 * 1024))
		throw new Error('Dataset exceeds Cloudflare Pages limits');
	const version = datasetVersion(files, sources);
	const manifest: Manifest = {
		formatVersion: 1,
		version,
		builtAt,
		files: files.map((f) => ({ ...f, path: `${version}/${f.path}` })),
		sources
	};
	await mkdir(paths.output, { recursive: true });
	const staging = await mkdtemp(resolve(paths.output, '.build-'));
	try {
		for (const [name, bytes] of artifacts) await atomicWrite(resolve(staging, name), bytes);
		await publishDataset(paths.output, staging, manifest, JSON.stringify(manifest, null, 2) + '\n');
	} finally {
		await removeStaging(staging);
	}
	await atomicWrite(
		resolve(paths.cache, 'report.json'),
		JSON.stringify(
			{
				...report,
				version,
				builtAt,
				sourcesIncluded: sources.length,
				products: products.size,
				identityMerges,
				groupwiseMerges,
				remainingCollisionGroups,
				measurements: partitionMetadata.map((p) => ({ partition: p.id, count: p.measurementCount })),
				files: manifest.files,
				unmatchedBrands: [...unmatchedBrands].sort(),
				identityCollisions: [...identities]
					.filter(([, names]) => names.size > 1)
					.map(([id, names]) => ({ id, names: [...names].sort() })),
				suspiciousNearDuplicates: suspiciousNames(sortedProducts)
			},
			null,
			2
		)
	);
	console.log(
		`Built ${version}: ${products.size} products, ${sources.length} databases, ${files.length} files, ${files.reduce((n, f) => n + f.bytes, 0)} compressed bytes. Report: ${resolve(paths.cache, 'report.json')}`
	);
	console.log(
		`Identity: net reduction ${identityMerges.merged} products (${productsBefore} unique original keys before, ${products.size} after); ${groupwiseMerges.merged} groupwise merges`
	);
	console.log(
		`Top remaining identity collision candidates (not merged): ${JSON.stringify(remainingCollisionGroups.slice(0, 5))}`
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
	build().catch((e: unknown) => {
		console.error(errorMessage(e));
		process.exitCode = 1;
	});
