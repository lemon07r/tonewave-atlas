import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildRedirects, previousCatalogs } from './redirects.ts';
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
	nonProductName
} from './common.ts';
import {
	collisionGroups,
	configurationDescriptor,
	DisplayNames,
	defaultVariantIndex,
	identity,
	normalise,
	sampleContext,
	sourceFor,
	suspiciousNames,
	usdPrice,
	variant
} from './transform.ts';
import { publishDataset, removeStaging } from './publish.ts';
import { medianSpreadByBand, rankStatistics } from './statistics.ts';
import { referenceTargets } from './targets.ts';
import {
	cleanEntry,
	curveProblem,
	duplicateDefault,
	entryForm,
	identityProblem,
	modification,
	partitionFor
} from './quality.ts';
import { rigEvidence } from './rig-evidence.ts';
import { classifyEq, factoryMode } from './eq.ts';
import { mergeSwitchIdentities, reconcileSwitchDefaults, reviewVariantStates } from './switches.ts';
import { finaliseDefaults, withProvisionalDefaults } from './default-coverage.ts';
import { mergeSampleIdentities } from './samples.ts';

export interface PartitionCurve {
	measurement: Measurement;
	configuration?: string;
	sourceOrder?: number;
	sourceIsolated?: boolean;
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
	const defaults = new Map<string, PartitionCurve[]>();
	const originalPartitions = new Map<string, string>();
	const report = {
		quality: {
			quarantine: [] as {
				source: string;
				file: string;
				brand: string;
				model: string;
				partition: string;
				reason: string;
				validChannels: boolean;
			}[],
			forms: [] as {
				source: string;
				file: string;
				name: string;
				before: string;
				after: string;
				reason: string;
			}[],
			markers: [] as { source: string; before: string; after: string }[],
			curveAudit: [] as { source: string; file: string; channel: string; reason: string }[],
			variantCorrections: [] as {
				source: string;
				file: string;
				label: string;
				before: string;
				after: string;
			}[],
			eqAudit: [] as { source: string; file: string; name: string; decision: string }[],
			ambiguousEqLabelsKeptAsTuning: [] as {
				source: string;
				file: string;
				label: string;
				index: number;
				measurementId: string;
			}[],
			tuningModes: [] as {
				source: string;
				file: string;
				label: string;
				index: number;
				classification: string;
				kind: string;
				isDefault: boolean;
			}[],
			defaultSelections: [] as {
				source: string;
				name: string;
				index: number | null;
				file: string | null;
			}[],
			scanned: {} as Record<string, { phones: number; measurements: number; reclassified: number }>
		},
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
			originalPartitions.set(
				source.id,
				source.partition.startsWith('iem-source-') ? 'iem-711' : source.partition
			);
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
		const shortSamples = sampleContext(book.phones);
		const scanned = { phones: book.phones.length, measurements: 0, reclassified: 0 };
		report.quality.scanned[db.id] = scanned;
		for (const rawPhone of book.phones) {
			const formDecision = entryForm(rawPhone);
			const form = formDecision.form ?? source.form;
			const cleanPhone = cleanEntry(rawPhone, source, [...Object.keys(brands), ...Object.values(brands)]);
			if (cleanPhone.brand !== rawPhone.brand || cleanPhone.name !== rawPhone.name)
				report.quality.markers.push({
					source: source.id,
					before: `${rawPhone.brand} ${rawPhone.name}`,
					after: `${cleanPhone.brand} ${cleanPhone.name}`
				});
			if (
				cleanPhone.file.some(
					(file, i) =>
						classifyEq(`${cleanPhone.brand} ${cleanPhone.name} ${file} ${cleanPhone.suffix[i] ?? ''}`) !==
							'none' || factoryMode(cleanPhone.suffix[i] ?? '')
				)
			) {
				const index = defaultVariantIndex(cleanPhone, shortSamples.has(rawPhone));
				report.quality.defaultSelections.push({
					source: db.id,
					name: `${cleanPhone.brand} ${cleanPhone.name}`,
					index,
					file: index === null ? null : (cleanPhone.file[index] ?? null)
				});
			}
			const originalProduct = identity(cleanPhone.brand, cleanPhone.name, form, aliases, productAliases);
			const originalProblem = identityProblem(originalProduct.brand, originalProduct.model);
			for (const [index, file] of cleanPhone.file.entries()) {
				const phone = modification(cleanPhone, index);
				counts.variants++;
				const text = `${phone.brand} ${phone.name} ${file} ${phone.suffix[index] ?? ''}`;
				const derived = nonProductName(text);
				const quarantine = (reason: string, validChannels: boolean) => {
					report.quality.quarantine.push({
						source: db.id,
						file,
						brand: rawPhone.brand,
						model: rawPhone.name,
						partition: originalPartitions.get(source.id) ?? source.partition,
						reason,
						validChannels
					});
					reject(file, `quarantine: ${reason}`);
				};
				if (/eq/i.test(text))
					report.quality.eqAudit.push({
						source: db.id,
						file,
						name: `${phone.brand} ${phone.name}`,
						decision: derived ?? `retained: ${classifyEq(text)}`
					});
				if (derived) {
					quarantine(derived, false);
					continue;
				}
				if (excluded.products.includes(`${phone.brand} ${phone.name}`) || excluded.files.includes(file)) {
					reject(file, 'local exclusion');
					continue;
				}
				const product = identity(phone.brand, phone.name, form, aliases, productAliases);
				const problem = originalProblem ?? identityProblem(product.brand, product.model);
				if (problem) {
					quarantine(problem, false);
					continue;
				}
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
					const rawProblem = curveProblem(parsed.points.db, false);
					if (rawProblem) {
						report.quality.curveAudit.push({ source: db.id, file, channel, reason: rawProblem });
						warnings.push(`${channel}: ${rawProblem}`);
						continue;
					}
					const values = resample(parsed.points);
					if (calibration)
						for (let i = 0; i < values.length; i++) {
							const cal = calibration[i] ?? NaN;
							if (Number.isFinite(cal)) values[i] = (values[i] ?? NaN) - cal;
						}
					const calibratedProblem = curveProblem(values, true);
					if (calibratedProblem) {
						report.quality.curveAudit.push({ source: db.id, file, channel, reason: calibratedProblem });
						warnings.push(`${channel}: ${calibratedProblem}`);
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
				const selectedVariant = variant(phone, index, id, shortSamples.has(rawPhone));
				const defaultKey = `${source.id}:${product.id}`;
				const configuration = configurationDescriptor(phone, index);
				if (
					selectedVariant.kind === 'default' &&
					defaults
						.get(defaultKey)
						?.some((c) => c.configuration === configuration && duplicateDefault(rank, c.rank.values))
				) {
					quarantine('near-identical duplicate default from same source/normalised identity', true);
					continue;
				}
				// Compare against the previous classifier without changing its original descriptor inputs.
				const oldText = `${phone.suffix[index] ?? (index === 0 ? '' : file)} ${file}`;
				const oldKind =
					index === 0
						? 'default'
						: /switch|nozzle|impedance|\bohm|\bdsp\b|filter|bass|treble|\banc\b|transparent|\bon\b|\boff\b|m20|m15|m12|\bmx\b/i.test(
									oldText
							  )
							? 'tuning'
							: /tip|insert|shallow|deep|foam|pad|seal|position/i.test(oldText)
								? 'fit'
								: /adapter|dongle|cable|\bamp\b|balanced|single.ended/i.test(oldText)
									? 'setup'
									: /sample|unit|proto|defect|\bs\d\b/i.test(oldText)
										? 'unit'
										: 'unknown';
				if (oldKind !== selectedVariant.kind)
					report.quality.variantCorrections.push({
						source: db.id,
						file,
						label: selectedVariant.label,
						before: oldKind,
						after: selectedVariant.kind
					});
				if (form !== source.form) {
					report.quality.forms.push({
						source: db.id,
						file,
						name: `${phone.brand} ${phone.name}`,
						before: source.form,
						after: form,
						reason: formDecision.reason ?? ''
					});
					scanned.reclassified++;
				}
				scanned.measurements++;
				const eq = classifyEq(text);
				if (eq !== 'none' || factoryMode(selectedVariant.label))
					report.quality.tuningModes.push({
						source: db.id,
						file,
						label: selectedVariant.label,
						index,
						classification: eq === 'none' ? 'factory mode' : eq,
						kind: selectedVariant.kind,
						isDefault: selectedVariant.isDefault
					});
				if (eq === 'ambiguous')
					report.quality.ambiguousEqLabelsKeptAsTuning.push({
						source: db.id,
						file,
						label: selectedVariant.label,
						index,
						measurementId: id
					});
				const measurement: Measurement = {
					id,
					productId: product.id,
					sourceId: source.id,
					partition: partitionFor(source, form, formDecision.sourceIsolated),
					variant: selectedVariant,
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
							...(phone.name !== cleanPhone.name
								? [`distinct modified-product identity: ${phone.name}`]
								: []),
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
						form,
						measurementIds: []
					};
					products.set(p.id, p);
				}
				p.measurementIds.push(id);
				displayNames.observe(product);
				trackIdentity(product, `${phone.brand} ${phone.name}`);
				if (!aliases[normalise(phone.brand)]) unmatchedBrands.add(phone.brand);
				const group = partitions.get(measurement.partition) ?? [];
				const row = {
					measurement,
					sourceIsolated: formDecision.sourceIsolated ?? false,
					configuration,
					sourceOrder: counts.variants,
					channels: curves,
					rank: { measurementId: id, channel: 'avg', values: rank }
				};
				group.push(row);
				if (selectedVariant.kind === 'default')
					defaults.set(defaultKey, [...(defaults.get(defaultKey) ?? []), row]);
				partitions.set(measurement.partition, group);
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
	const allCurves = [...partitions.values()].flat();
	const sampleIdentity = mergeSampleIdentities(products, allCurves, aliases, productAliases);
	const switchIdentity = mergeSwitchIdentities(products, allCurves);
	for (const move of [...sampleIdentity.moves, ...switchIdentity.moves]) {
		for (const map of [identities, originalIdentities]) {
			const names = map.get(move.to) ?? new Set<string>();
			for (const name of map.get(move.from) ?? []) names.add(name);
			map.set(move.to, names);
			map.delete(move.from);
		}
	}
	const switchDefaults = reconcileSwitchDefaults(products, allCurves);
	// Rig evidence must see the same default-kind contract as the engine. These provisional
	// selections are restored so final choices use final partitions, not provisional isolation.
	const iemCurves = allCurves.filter((c) => products.get(c.measurement.productId)?.form === 'iem');
	const { coverage: rigDefaultCoverage, value: rigReport } = withProvisionalDefaults(
		products,
		allCurves,
		switchDefaults.decisions,
		() =>
			rigEvidence(
				sources.filter((s) => iemCurves.some((c) => c.measurement.sourceId === s.id)),
				iemCurves.map((c) => ({ measurement: c.measurement, values: c.rank.values }))
			)
	);
	const hasControls =
		rigReport.sources.some((s) => s.control === '5128') && rigReport.sources.some((s) => s.control === '711');
	if (hasControls && (!rigReport.separated || !rigReport.loco.passes || rigReport.minimumProducts === null)) {
		await atomicWrite(resolve(paths.cache, 'rig-evidence-blocked.json'), JSON.stringify(rigReport, null, 2));
		throw new Error(
			`BLOCKED: rig projection controls do not separate/stabilise; see rig-evidence-blocked.json (${JSON.stringify(rigReport.separation)})`
		);
	}
	for (const score of rigReport.sources) {
		const source = sources.find((s) => s.id === score.source);
		if (!source?.rigEvidence) continue;
		source.rigEvidence = {
			configRig: score.configRig,
			class: score.class,
			family: score.family,
			rationale: score.control
				? source.rigEvidence.rationale
				: score.class === 'evidenced'
					? '95% product-bootstrap projection interval lies wholly on one side of the leave-source-out control threshold'
					: 'Insufficient overlap or projection interval crosses the control threshold',
			sharedProducts: score.sharedProducts,
			projection: score.projection,
			interval: score.interval,
			threshold: rigReport.threshold,
			minimumProducts: rigReport.minimumProducts
		};
		source.rigInferred = score.class !== 'verified';
		if (source.form === 'iem') source.partition = partitionFor(source, 'iem');
	}
	partitions.clear();
	for (const row of allCurves) {
		const source = sources.find((s) => s.id === row.measurement.sourceId);
		const form = products.get(row.measurement.productId)?.form;
		if (!source || !form) throw new Error('Missing accepted source/form');
		row.measurement.partition = partitionFor(source, form, row.sourceIsolated);
		const group = partitions.get(row.measurement.partition) ?? [];
		group.push(row);
		partitions.set(row.measurement.partition, group);
	}
	const defaultCoverage = finaliseDefaults(products, allCurves, switchDefaults.decisions);
	const unknownVariants = allCurves
		.filter((c) => c.measurement.variant.kind === 'unknown')
		.map(({ measurement: m }) => ({
			source: m.sourceId,
			productId: m.productId,
			file: m.variant.file,
			label: m.variant.label
		}));
	for (const source of sources) {
		const rows = allCurves.filter((c) => c.measurement.sourceId === source.id);
		source.measurementCount = rows.length;
		source.forms = [
			...new Set(
				rows.map((c) => {
					const product = products.get(c.measurement.productId);
					if (!product) throw new Error('Missing accepted product');
					return product.form;
				})
			)
		].sort();
		source.partitions = [...new Set(rows.map((c) => c.measurement.partition))].sort();
	}
	const quarantineSummary = [...Map.groupBy(report.quality.quarantine, (q) => q.partition)].map(
		([partition, rows]) => {
			const duplicateDefaults = rows.filter((q) => q.validChannels).length;
			const retained = allCurves.filter(
				(c) => originalPartitions.get(c.measurement.sourceId) === partition
			).length;
			return {
				partition,
				candidates: rows.length,
				reasons: Object.fromEntries(
					[...Map.groupBy(rows, (q) => q.reason)].map(([reason, qs]) => [reason, qs.length])
				),
				legitimateDuplicateDefaults: duplicateDefaults,
				legitimateDenominator: retained + duplicateDefaults,
				smallPartitionExempt: retained + duplicateDefaults < 200
			};
		}
	);
	if (
		quarantineSummary.some(
			(s) => !s.smallPartitionExempt && s.legitimateDuplicateDefaults / s.legitimateDenominator > 0.03
		)
	) {
		await atomicWrite(
			resolve(paths.cache, 'quality-blocked.json'),
			JSON.stringify({ ...report.quality, quarantineSummary }, null, 2)
		);
		throw new Error(
			'BLOCKED: more than 3% legitimate duplicate defaults removed from a partition with >=200 measurements; see quality-blocked.json'
		);
	}
	const formGroups = Map.groupBy(
		[...products.values()],
		(p) => `${normalise(p.brand)}:${normalise(p.model)}`
	);
	const remainingFormConflicts = [...formGroups.values()]
		.filter((ps) => new Set(ps.map((p) => p.form)).size > 1)
		.map((ps) =>
			ps.map((p) => ({
				id: p.id,
				brand: p.brand,
				model: p.model,
				form: p.form,
				sources: [
					...new Set(
						allCurves.filter((c) => c.measurement.productId === p.id).map((c) => c.measurement.sourceId)
					)
				]
			}))
		);
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
	const previous = await previousCatalogs(paths.output);
	const catalogs: Catalog[] = [];
	for (const form of ['iem', 'headphone'] as const) {
		const catalog: Catalog = {
			formatVersion: 1,
			form,
			products: sortedProducts.filter((p) => p.form === form),
			measurements: [...partitions.values()]
				.flatMap((cs) => cs.map((c) => c.measurement))
				.filter((m) => products.get(m.productId)?.form === form)
				.sort((a, b) => a.id.localeCompare(b.id, 'en')),
			sources: sources.filter((s) => s.forms?.includes(form)),
			partitions: partitionMetadata.filter((p) => p.form === form)
		};
		catalogs.push(catalog);
	}
	const redirects = {
		baselineVersion: previous.version,
		warnings: previous.warnings,
		...buildRedirects(previous.catalogs, catalogs)
	};
	for (const catalog of catalogs)
		artifacts.set(`catalog-${catalog.form}.json.gz`, gzipSync(JSON.stringify(catalog), { level: 9 }));
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
		sources,
		partitions: catalogs.flatMap((catalog) =>
			catalog.partitions.map((partition) => ({
				id: partition.id,
				form: partition.form,
				measurementCount: partition.measurementCount,
				productCount: new Set(
					catalog.measurements.filter((m) => m.partition === partition.id).map((m) => m.productId)
				).size
			}))
		)
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
				redirects,
				sampleIdentity,
				switchIdentity,
				switchDefaults,
				defaultCoverage,
				rigDefaultCoverage,
				variantReview: reviewVariantStates(products, allCurves),
				unknownVariants,
				rigEvidence: rigReport,
				sourceEvidence: sources.map((s) => ({
					...s,
					partitionBefore: originalPartitions.get(s.id) ?? s.partition
				})),
				quarantineSummary,
				remainingFormConflicts,
				version,
				builtAt,
				sourcesIncluded: sources.length,
				publishersIncluded: new Set(sources.map((s) => s.username)).size,
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
