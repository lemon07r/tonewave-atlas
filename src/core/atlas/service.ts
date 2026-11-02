import type { Curve } from '../analysis/common.ts';
import { rankPacked, responseDistance, distanceSummary } from '../analysis/distance.ts';
import { compareReferences } from '../analysis/multi-reference.ts';
import { fitPeq, exportEqualizerApo, exportWavelet, exportPeqJson } from '../analysis/peq.ts';
import type { RatedItem } from '../analysis/taste.ts';
import { decodePack, decompressGzip, type CurvePack, type PackedCurve } from '../dataset/codec.ts';
import type {
	Catalog,
	Form,
	Manifest,
	Measurement,
	Partition,
	Product,
	ReferenceTarget
} from '../dataset/types.ts';
import { GRID, RANK_GRID, RANK_SIZE, RANK_STEP } from '../grid.ts';
import { parseMeasurement } from '../measurement/parse.ts';
import { averageChannels, resample } from '../measurement/resample.ts';
import { smoothOctave } from '../smooth.ts';
import { spreadFor } from './spread.ts';
import {
	buildPartitionIndex,
	consensus,
	priceRange,
	type IndexedCurve,
	type PartitionIndex
} from './index.ts';
import {
	alignedCurve,
	distanceOptions,
	rankingCaveats,
	scoredCurve,
	selectedSources,
	selection,
	sourceMode,
	topK,
	treblePenalty
} from './ranking.ts';
import { tasteRanking } from './taste-ranking.ts';
import type {
	AtlasOptions,
	AtlasError,
	AtlasSummary,
	MeasurementInfo,
	ProductListItem,
	SimilarRequest,
	SimilarResult,
	ReferenceInfo,
	RankFilters,
	TasteRequest,
	TasteResult,
	UnusedTasteItem,
	CompareRequest,
	CompareResult,
	ProductDetail,
	ProductSpread,
	CurveResult,
	PeqRequest,
	PeqResponse,
	UploadResult
} from './types.ts';

interface ResolvedReference {
	ok: true;
	catalog: Catalog;
	index: PartitionIndex;
	values: Float64Array;
	info: ReferenceInfo;
}
interface LocatedProduct {
	catalog: Catalog;
	product: Product;
}
interface LocatedMeasurement {
	catalog: Catalog;
	measurement: Measurement;
}
interface Upload {
	values: Float64Array;
	rankValues: Float64Array;
}

function failure(error: AtlasError['error'], message: string): AtlasError {
	return { ok: false, error, message };
}
function partitionProducts(catalog: Catalog, id: string): number {
	return new Set(catalog.measurements.filter((m) => m.partition === id).map((m) => m.productId)).size;
}
function meanCurves(curves: readonly PackedCurve[]): Float64Array | null {
	if (!curves.length) return null;
	return Float64Array.from(GRID, (_, i) => {
		let sum = 0,
			count = 0;
		for (const curve of curves) {
			const value = curve.values[i] ?? NaN;
			if (Number.isFinite(value)) {
				sum += value;
				count++;
			}
		}
		return count ? sum / count : NaN;
	});
}
function channelValues(curves: readonly PackedCurve[], channel: 'avg' | 'L' | 'R'): Float64Array | null {
	const left = meanCurves(curves.filter((c) => /^(?:L\d*|\d*)$/.test(c.channel)));
	const right = meanCurves(curves.filter((c) => /^R\d*$/.test(c.channel)));
	return channel === 'L'
		? left
		: channel === 'R'
			? right
			: left || right
				? averageChannels(left, right).values
				: null;
}

/** Framework-free, partition-local dataset facade. All returned values are structured-clone friendly. */
function listedPrices(measurements: readonly Measurement[]): NonNullable<Measurement['price']>[] {
	const seen = new Map<string, NonNullable<Measurement['price']>>();
	for (const m of measurements) {
		const price = m.price;
		if (price?.usd == null || !Number.isFinite(price.usd)) continue;
		const key = `${price.sourceId}|${price.usd}`;
		if (!seen.has(key)) seen.set(key, price);
	}
	return [...seen.values()];
}

const SOURCE_INDEX_CACHE_SIZE = 4;

export class AtlasService {
	private readonly baseUrl: string;
	private readonly fetcher: typeof globalThis.fetch;
	private readonly detailCacheSize: number;
	private manifestPromise: Promise<Manifest> | undefined;
	private targetsPromise: Promise<ReferenceTarget[]> | undefined;
	private readonly catalogs = new Map<Form, Promise<Catalog>>();
	private readonly ranks = new Map<string, Promise<CurvePack>>();
	private readonly indexes = new Map<string, Promise<PartitionIndex>>();
	private readonly sourceIndexes = new Map<string, Promise<PartitionIndex>>();
	private readonly partitionSources = new Map<string, ReadonlySet<string>>();
	private readonly details = new Map<string, CurvePack>();
	private readonly pendingDetails = new Map<string, Promise<CurvePack>>();
	private readonly uploads = new Map<string, Upload>();
	private nextUpload = 0;

	constructor(options: AtlasOptions) {
		this.baseUrl = options.baseUrl.replace(/\/?$/, '/');
		this.fetcher = options.fetch;
		this.detailCacheSize = options.detailCacheSize ?? 8;
		if (!Number.isInteger(this.detailCacheSize) || this.detailCacheSize < 1)
			throw new RangeError('detailCacheSize must be positive');
	}

	private async bytes(path: string): Promise<Uint8Array> {
		const response = await this.fetcher(`${this.baseUrl}${path}`);
		if (!response.ok) throw new Error(`Dataset request failed (${response.status}): ${path}`);
		const bytes = new Uint8Array(await response.arrayBuffer());
		// A server may already have decoded Content-Encoding: gzip; inspect the bytes, not the suffix.
		return bytes[0] === 0x1f && bytes[1] === 0x8b ? decompressGzip(bytes) : bytes;
	}
	private manifest(): Promise<Manifest> {
		this.manifestPromise ??= this.bytes('manifest.json')
			.then((bytes) => JSON.parse(new TextDecoder().decode(bytes)) as Manifest)
			.catch((error: unknown) => {
				this.manifestPromise = undefined;
				throw error;
			});
		return this.manifestPromise;
	}
	private catalog(form: Form): Promise<Catalog> {
		let pending = this.catalogs.get(form);
		if (!pending) {
			pending = this.manifest()
				.then(async (manifest) => {
					const bytes = await this.bytes(`${manifest.version}/catalog-${form}.json.gz`);
					return JSON.parse(new TextDecoder().decode(bytes)) as Catalog;
				})
				.catch((error: unknown) => {
					this.catalogs.delete(form);
					throw error;
				});
			this.catalogs.set(form, pending);
		}
		return pending;
	}
	private async locateProduct(id: string): Promise<LocatedProduct | null> {
		const forms = new Set<Form>([...this.catalogs.keys(), 'iem', 'headphone']);
		for (const form of forms) {
			const catalog = await this.catalog(form);
			const product = catalog.products.find((p) => p.id === id);
			if (product) return { catalog, product };
		}
		return null;
	}
	private async locateMeasurement(id: string): Promise<LocatedMeasurement | null> {
		const forms = new Set<Form>([...this.catalogs.keys(), 'iem', 'headphone']);
		for (const form of forms) {
			const catalog = await this.catalog(form);
			const measurement = catalog.measurements.find((m) => m.id === id);
			if (measurement) return { catalog, measurement };
		}
		return null;
	}
	private async locatePartition(id: string): Promise<{ catalog: Catalog; partition: Partition } | null> {
		for (const form of new Set<Form>([...this.catalogs.keys(), 'iem', 'headphone'])) {
			const catalog = await this.catalog(form);
			const partition = catalog.partitions.find((p) => p.id === id);
			if (partition) return { catalog, partition };
		}
		return null;
	}
	private rank(partition: Partition): Promise<CurvePack> {
		let pending = this.ranks.get(partition.id);
		if (!pending) {
			pending = this.manifest()
				.then(async (m) => decodePack(await this.bytes(`${m.version}/${partition.rankFile}`)))
				.catch((error: unknown) => {
					this.ranks.delete(partition.id);
					throw error;
				});
			this.ranks.set(partition.id, pending);
		}
		return pending;
	}
	private async rankingIndex(
		catalog: Catalog,
		partition: Partition,
		requested?: boolean,
		filters?: RankFilters
	): Promise<PartitionIndex | AtlasError> {
		const pack = await this.rank(partition);
		const statistics = pack.statistics ?? partition.statistics;
		const supported = statistics?.support?.status === 'sufficient';
		if (requested === true && !supported)
			return failure(
				'insufficient-data',
				'Reviewer-offset correction requires sufficient partition support.'
			);
		const validation = statistics?.harmonisation;
		const positive = (value: number | null | undefined) =>
			value != null && Number.isFinite(value) && value > 0;
		const validated =
			supported &&
			positive(validation?.meanImprovement) &&
			!!validation?.folds.length &&
			validation.folds.length === validation.foldCount &&
			validation.folds.every((fold) => positive(fold.meanImprovement));
		return this.index(catalog, partition, requested ?? validated, filters);
	}
	private async index(
		catalog: Catalog,
		partition: Partition,
		harmonise = false,
		filters?: RankFilters
	): Promise<PartitionIndex> {
		let sources = selectedSources(filters);
		if (sources) {
			let present = this.partitionSources.get(partition.id);
			if (!present) {
				present = new Set(
					catalog.measurements.filter((m) => m.partition === partition.id).map((m) => m.sourceId)
				);
				this.partitionSources.set(partition.id, present);
			}
			sources = sources.filter((id) => present.has(id));
		}
		const key = JSON.stringify([partition.id, harmonise, sources ?? null]);
		const cache = sources ? this.sourceIndexes : this.indexes;
		let pending = cache.get(key);
		if (pending && sources) {
			cache.delete(key);
			cache.set(key, pending);
		}
		if (!pending) {
			pending = this.rank(partition)
				.then((pack) => buildPartitionIndex(catalog, partition, pack, harmonise, sources))
				.catch((error: unknown) => {
					if (cache.get(key) === pending) cache.delete(key);
					throw error;
				});
			cache.set(key, pending);
			if (sources && cache.size > SOURCE_INDEX_CACHE_SIZE) {
				const oldest = cache.keys().next().value;
				if (oldest !== undefined) cache.delete(oldest);
			}
		}
		return pending;
	}
	private async detailPack(file: string, partition: string): Promise<CurvePack> {
		const cached = this.details.get(file);
		if (cached) {
			this.details.delete(file);
			this.details.set(file, cached);
			return cached;
		}
		let pending = this.pendingDetails.get(file);
		if (!pending) {
			pending = this.manifest()
				.then(async (m) => {
					const pack = decodePack(await this.bytes(`${m.version}/${file}`));
					if (pack.kind !== 'detail' || pack.points !== GRID.length || pack.partition !== partition)
						throw new Error('Detail pack does not match partition/grid');
					this.details.set(file, pack);
					while (this.details.size > this.detailCacheSize) {
						const oldest = this.details.keys().next().value;
						if (oldest !== undefined) this.details.delete(oldest);
					}
					return pack;
				})
				.finally(() => {
					this.pendingDetails.delete(file);
				});
			this.pendingDetails.set(file, pending);
		}
		return pending;
	}
	private async detailCurves(m: Measurement): Promise<PackedCurve[]> {
		return (await this.detailPack(m.detailFile, m.partition)).curves.filter((c) => c.measurementId === m.id);
	}
	private async choosePartition(
		catalog: Catalog,
		measurements: readonly Measurement[],
		requested?: string,
		defaultProductId?: string,
		settings: Pick<SimilarRequest, 'focus' | 'customBands' | 'treblePenalty' | 'filters'> = {}
	): Promise<Partition | undefined> {
		if (requested) return catalog.partitions.find((p) => p.id === requested);
		const counts = new Map<string, number>();
		for (const m of measurements) {
			if (!defaultProductId || m.variant.kind === 'default')
				counts.set(m.partition, (counts.get(m.partition) ?? 0) + 1);
		}
		const available = await Promise.all(
			catalog.partitions
				.filter((p) => counts.has(p.id))
				.map(async (partition) => {
					if (!defaultProductId) return { partition, count: counts.get(partition.id) ?? 0 };
					const index = await this.index(catalog, partition, false, settings.filters);
					const row = index.products.get(defaultProductId);
					return {
						partition,
						count: Number(
							!!row && !!distanceSummary(row.values, row.values, distanceOptions(index, settings))
						)
					};
				})
		);
		return available
			.filter((p) => p.count > 0)
			.sort(
				(a, b) =>
					b.count - a.count ||
					partitionProducts(catalog, b.partition.id) - partitionProducts(catalog, a.partition.id) ||
					a.partition.id.localeCompare(b.partition.id)
			)[0]?.partition;
	}
	private async reference(
		input: Pick<
			SimilarRequest,
			| 'productId'
			| 'measurementId'
			| 'uploadId'
			| 'partition'
			| 'harmonise'
			| 'focus'
			| 'customBands'
			| 'treblePenalty'
			| 'filters'
		>
	): Promise<ResolvedReference | AtlasError> {
		if (input.uploadId) {
			if (input.productId || input.measurementId) throw new RangeError('Choose one reference identity');
			const upload = this.uploads.get(input.uploadId);
			if (!upload) return failure('unknown-upload', 'Upload is not in this service session.');
			if (!input.partition)
				return failure(
					'partition-required',
					'Choose the rig matching this upload; no rig is inferred from text.'
				);
			const found = await this.locatePartition(input.partition);
			if (!found) return failure('not-measured-on-rig', 'Unknown partition.');
			// Uploads have no catalog source identity, so both sides must remain on the raw basis.
			const index = await this.rankingIndex(found.catalog, found.partition, false, input.filters);
			if ('ok' in index) return index;
			return {
				ok: true,
				catalog: found.catalog,
				index,
				values: upload.rankValues,
				info: { productId: null, uploadId: input.uploadId, measurementIds: [], sources: [] }
			};
		}
		let found: LocatedProduct | null;
		let selected: Measurement | undefined;
		if (input.measurementId) {
			const located = await this.locateMeasurement(input.measurementId);
			if (!located || (input.productId && located.measurement.productId !== input.productId))
				return failure('unknown-measurement', 'Measurement does not belong to the requested product.');
			selected = located.measurement;
			const product = located.catalog.products.find((p) => p.id === selected?.productId);
			found = product ? { catalog: located.catalog, product } : null;
		} else {
			if (!input.productId) throw new RangeError('A product, measurement or upload reference is required');
			found = await this.locateProduct(input.productId);
		}
		if (!found) return failure('unknown-product', 'Product is not in the catalog.');
		const measurements = found.catalog.measurements.filter(
			(m) => m.productId === found.product.id && (!selected || m.id === selected.id)
		);
		const partition = await this.choosePartition(
			found.catalog,
			measurements,
			input.partition,
			selected ? undefined : found.product.id,
			input
		);
		if (!partition || !measurements.some((m) => m.partition === partition.id))
			return failure('not-measured-on-rig', 'Reference is not measured on this rig.');
		const index = await this.rankingIndex(found.catalog, partition, input.harmonise, input.filters);
		if ('ok' in index) return index;
		const candidate = index.products.get(found.product.id);
		const row = selected ? index.measurements.get(selected.id) : undefined;
		const values = selected ? row?.values : candidate?.values;
		if (!values || !distanceSummary(values, values, distanceOptions(index, input)))
			return failure(
				'not-measured-on-rig',
				'No usable default reference on this rig; select an explicit measurement for a non-default variant.'
			);
		const measurementIds = selected ? [selected.id] : (candidate?.info.measurementIds ?? []);
		const sources = selected
			? found.catalog.sources.filter((s) => s.id === selected.sourceId)
			: (candidate?.info.sources ?? []);
		return {
			ok: true,
			catalog: found.catalog,
			index,
			values: scoredCurve(values),
			info: { productId: found.product.id, uploadId: null, measurementIds, sources }
		};
	}
	async summary(): Promise<AtlasSummary> {
		const [manifest, ...catalogs] = await Promise.all([
			this.manifest(),
			this.catalog('iem'),
			this.catalog('headphone')
		]);
		const counts = new Map<string, number>();
		for (const m of catalogs.flatMap((c) => c.measurements))
			counts.set(m.sourceId, (counts.get(m.sourceId) ?? 0) + 1);
		return {
			version: manifest.version,
			builtAt: manifest.builtAt,
			sources: manifest.sources.map((source) => ({
				...source,
				measurementCount: counts.get(source.id) ?? 0
			})),
			partitions: catalogs.flatMap((c) =>
				c.partitions.map((p) => ({
					id: p.id,
					form: p.form,
					measurementCount: p.measurementCount,
					productCount: new Set(c.measurements.filter((m) => m.partition === p.id).map((m) => m.productId))
						.size
				}))
			)
		};
	}
	async targets(form: Form): Promise<ReferenceTarget[]> {
		this.targetsPromise ??= this.manifest()
			.then(
				async (manifest) =>
					JSON.parse(
						new TextDecoder().decode(await this.bytes(`${manifest.version}/targets.json.gz`))
					) as ReferenceTarget[]
			)
			.catch((error: unknown) => {
				this.targetsPromise = undefined;
				throw error;
			});
		return structuredClone((await this.targetsPromise).filter((target) => target.form === form));
	}
	async products(form: Form): Promise<ProductListItem[]> {
		const catalog = await this.catalog(form);
		const grouped = new Map<string, Measurement[]>();
		for (const m of catalog.measurements) {
			const group = grouped.get(m.productId) ?? [];
			group.push(m);
			grouped.set(m.productId, group);
		}
		return catalog.products.map((p) => {
			const measurements = grouped.get(p.id) ?? [];
			return {
				id: p.id,
				brand: p.brand,
				model: p.model,
				partitions: [...new Set(measurements.map((m) => m.partition))],
				defaultPartitions: [
					...new Set(measurements.filter((m) => m.variant.kind === 'default').map((m) => m.partition))
				],
				sourceCount: new Set(measurements.map((m) => m.sourceId)).size,
				measurementCount: measurements.length,
				variantLabels: [
					...new Set(measurements.filter((m) => m.variant.kind === 'tuning').map((m) => m.variant.label))
				],
				priceUsd: priceRange(measurements.map((m) => m.price)),
				prices: listedPrices(measurements)
			};
		});
	}
	async measurements(ids: readonly string[]): Promise<MeasurementInfo[]> {
		const output: MeasurementInfo[] = [];
		for (const id of ids) {
			const located = await this.locateMeasurement(id);
			if (!located) continue;
			const { catalog, measurement } = located;
			const product = catalog.products.find((p) => p.id === measurement.productId);
			const source = catalog.sources.find((s) => s.id === measurement.sourceId);
			output.push({
				id,
				productId: measurement.productId,
				brand: product?.brand ?? '',
				model: product?.model ?? '',
				partition: measurement.partition,
				sourceId: measurement.sourceId,
				sourceName: source?.name ?? measurement.sourceId,
				variantLabel: measurement.variant.label,
				variantKind: measurement.variant.kind
			});
		}
		return output;
	}
	async similar(request: SimilarRequest): Promise<SimilarResult | AtlasError> {
		const k = topK(request.topK);
		treblePenalty(request.treblePenalty);
		const reference = await this.reference(request);
		if (!reference.ok) return reference;
		const { index } = reference;
		const options = distanceOptions(index, request);
		const selected = selection(
			index,
			request.filters,
			new Set(reference.info.productId ? [reference.info.productId] : []),
			true,
			request.measurementId
		);
		const ranked = rankPacked(selected.matrix, reference.values, k, options);
		return {
			ok: true,
			partition: index.partition.id,
			harmonised: index.harmonised,
			sourceMode: sourceMode(request.filters),
			rankFrequencies: RANK_GRID.slice(),
			rankWeights: options.weights.slice(),
			treblePenalty: options.treblePenalty,
			reference: { ...reference.info, rankCurve: reference.values.slice() },
			results: ranked.matches.flatMap((match) => {
				const candidate = selected.candidates[match.index];
				if (!candidate) return [];
				const distances = candidate.perSource.flatMap((c) => {
					const d = responseDistance(c, reference.values, options);
					return d ? [d.distance] : [];
				});
				return [
					{
						candidate: candidate.info,
						...match.stats,
						rankCurve: alignedCurve(
							selected.matrix.subarray(match.index * RANK_SIZE, (match.index + 1) * RANK_SIZE),
							match.stats.offset
						),
						offsetDb: match.stats.offset,
						perSourceRange:
							distances.length > 1
								? ([Math.min(...distances), Math.max(...distances)] as [number, number])
								: null,
						sourceCount: distances.length,
						sameProduct: candidate.info.product.id === reference.info.productId
					}
				];
			}),
			caveats: rankingCaveats(
				index,
				reference.info.productId ? [reference.info.productId] : [],
				selected.candidates.map((c) => c.info.product.id)
			)
		};
	}

	private async bestPartition(
		items: readonly { productId: string; measurementId?: string }[],
		requested?: string,
		settings: Pick<SimilarRequest, 'focus' | 'customBands' | 'treblePenalty' | 'filters'> = {}
	): Promise<string | undefined> {
		if (requested) return requested;
		const counts = new Map<string, number>();
		const productCounts = new Map<string, number>();
		for (const item of items) {
			const found = await this.locateProduct(item.productId);
			if (!found) continue;
			const partitions = new Set(
				found.catalog.measurements
					.filter(
						(m) =>
							m.productId === item.productId &&
							(item.measurementId ? m.id === item.measurementId : m.variant.kind === 'default')
					)
					.map((m) => m.partition)
			);
			for (const id of partitions) {
				const partition = found.catalog.partitions.find((p) => p.id === id);
				if (!partition) continue;
				const index = await this.index(found.catalog, partition, false, settings.filters);
				const row = item.measurementId ? index.measurements.get(item.measurementId) : undefined;
				const values = item.measurementId
					? row?.measurement.productId === item.productId
						? row.values
						: undefined
					: index.products.get(item.productId)?.values;
				const usable = values && !!distanceSummary(values, values, distanceOptions(index, settings));
				if (usable) counts.set(id, (counts.get(id) ?? 0) + 1);
				productCounts.set(id, partitionProducts(found.catalog, id));
			}
		}
		return [...counts].sort(
			(a, b) =>
				b[1] - a[1] ||
				(productCounts.get(b[0]) ?? 0) - (productCounts.get(a[0]) ?? 0) ||
				a[0].localeCompare(b[0])
		)[0]?.[0];
	}
	async taste(request: TasteRequest): Promise<TasteResult | AtlasError> {
		topK(request.topK);
		const eligible = request.items.filter((i) => i.soundRelated && i.strength > 0 && i.rating !== 'neutral');
		const partitionId = await this.bestPartition(
			eligible.length ? eligible : request.items,
			request.partition,
			{ ...(request.filters ? { filters: request.filters } : {}) }
		);
		if (!partitionId)
			return failure(
				'insufficient-data',
				'No eligible measured ratings; add a sound-related like on a known rig.'
			);
		const found = await this.locatePartition(partitionId);
		if (!found) return failure('not-measured-on-rig', 'Unknown partition.');
		const index = await this.rankingIndex(found.catalog, found.partition, request.harmonise, request.filters);
		if ('ok' in index) return index;
		const items: RatedItem[] = [],
			unusedItems: UnusedTasteItem[] = [];
		for (const item of request.items) {
			if (!(item.strength >= 0 && item.strength <= 1)) throw new RangeError('Strength must be in [0,1]');
			let reason = !item.soundRelated
				? 'not-sound-related'
				: item.rating === 'neutral'
					? 'neutral-rating'
					: !item.strength
						? 'zero-strength'
						: '';
			if (reason) {
				unusedItems.push({ productId: item.productId, measurementId: item.measurementId ?? null, reason });
				continue;
			}
			const reference = await this.reference({
				productId: item.productId,
				...(item.measurementId ? { measurementId: item.measurementId } : {}),
				partition: partitionId,
				harmonise: index.harmonised,
				...(request.filters ? { filters: request.filters } : {})
			});
			if (!reference.ok) {
				reason = reference.error;
				unusedItems.push({ productId: item.productId, measurementId: item.measurementId ?? null, reason });
				continue;
			}
			const { productId, measurementId, ...rating } = item;
			items.push({ ...rating, id: measurementId ?? productId, curve: reference.values });
		}
		return tasteRanking(index, items, unusedItems, request, found.catalog.form);
	}
	async compare(request: CompareRequest): Promise<CompareResult | AtlasError> {
		const inputs: { productId: string; measurementId?: string }[] =
			request.references ?? request.productIds.map((productId) => ({ productId }));
		if (inputs.length < 2 || inputs.length > 4) throw new RangeError('Use 2–4 references');
		const k = topK(request.topK);
		treblePenalty(request.treblePenalty);
		if (request.sort !== undefined && !['mean', 'minimax'].includes(request.sort))
			throw new RangeError('Sort must be mean or minimax');
		// Establish identity and shared-rig support without ever replacing an explicit variant.
		const locatedReferences: LocatedProduct[] = [];
		for (const input of inputs) {
			const located = await this.locateProduct(input.productId);
			if (!located) return failure('unknown-product', `Unknown reference product: ${input.productId}`);
			if (
				input.measurementId &&
				!located.catalog.measurements.some(
					(m) => m.id === input.measurementId && m.productId === input.productId
				)
			)
				return failure(
					'unknown-measurement',
					`Measurement does not belong to reference ${input.productId}: ${input.measurementId}`
				);
			locatedReferences.push(located);
		}
		// Alternative rigs are expensive and relevant only to a missing-rig response. Metadata first
		// rules out unrelated packs before checking actual query-weight adequacy.
		const alternatives = async (): Promise<string[]> => {
			const allowed = selectedSources(request.filters);
			const possible = locatedReferences.map((found, i) => {
				const input = inputs[i];
				return new Set(
					found.catalog.measurements
						.filter(
							(m) =>
								m.productId === input?.productId &&
								(input.measurementId ? m.id === input.measurementId : m.variant.kind === 'default') &&
								(!allowed || allowed.includes(m.sourceId))
						)
						.map((m) => m.partition)
				);
			});
			const common = [...(possible[0] ?? [])].filter((id) => possible.every((p) => p.has(id))).sort();
			const usable: string[] = [];
			for (const id of common) {
				const checks = await Promise.all(
					inputs.map((input) => this.reference({ ...input, ...request, partition: id }))
				);
				if (checks.every((r) => r.ok)) usable.push(id);
			}
			return usable;
		};
		const partitionId = await this.bestPartition(inputs, request.partition, request);
		if (!partitionId)
			return {
				...failure(
					'not-measured-on-rig',
					`No usable measurements for references: ${inputs.map((r) => r.measurementId ?? r.productId).join(', ')}`
				),
				partitions: await alternatives()
			};
		const references: ResolvedReference[] = [];
		const missing: string[] = [];
		for (const input of inputs) {
			const reference = await this.reference({
				...input,
				...request,
				partition: partitionId,
				...(request.harmonise !== undefined ? { harmonise: request.harmonise } : {})
			});
			if (!reference.ok) {
				if (reference.error !== 'not-measured-on-rig') return reference;
				missing.push(`${input.productId}${input.measurementId ? ` (${input.measurementId})` : ''}`);
			} else references.push(reference);
		}
		if (missing.length)
			return {
				...failure(
					'not-measured-on-rig',
					`No usable measurement on ${partitionId} for references: ${missing.join(', ')}`
				),
				partitions: await alternatives()
			};
		const index = references[0]?.index;
		if (!index) return failure('insufficient-data', 'No references.');
		const selected = selection(index, request.filters, new Set(inputs.map((r) => r.productId)));
		const curves = selected.candidates.map((_, i) =>
			selected.matrix.subarray(i * RANK_SIZE, (i + 1) * RANK_SIZE)
		);
		const options = distanceOptions(index, request);
		const comparisons = compareReferences(
			curves,
			references.map((r) => r.values),
			options
		);
		const sort = request.sort ?? 'mean';
		const ordered = comparisons
			.map((tradeoff, i) => ({ tradeoff, i }))
			.filter(({ tradeoff }) => !request.paretoOnly || tradeoff.pareto)
			.sort((a, b) => (a.tradeoff[sort] ?? Infinity) - (b.tradeoff[sort] ?? Infinity) || a.i - b.i)
			.slice(0, k);
		return {
			ok: true,
			partition: partitionId,
			harmonised: index.harmonised,
			sourceMode: sourceMode(request.filters),
			rankFrequencies: RANK_GRID.slice(),
			rankWeights: options.weights.slice(),
			treblePenalty: options.treblePenalty,
			references: references.map((r) => ({ ...r.info, rankCurve: r.values.slice() })),
			results: ordered.flatMap(({ tradeoff, i }) => {
				const candidate = selected.candidates[i],
					curve = curves[i];
				if (!candidate || !curve) return [];
				const referenceIndex = tradeoff.offsets.findIndex((offset) => offset !== null);
				const alignedTo = referenceIndex < 0 ? null : referenceIndex;
				const offsetDb = tradeoff.offsets[referenceIndex] ?? 0;
				return [
					{
						candidate: candidate.info,
						tradeoff,
						rankCurve: alignedCurve(curve, offsetDb),
						offsetDb,
						alignedTo
					}
				];
			}),
			counts: { candidates: comparisons.length, pareto: comparisons.filter((r) => r.pareto).length },
			caveats: rankingCaveats(
				index,
				inputs.map((r) => r.productId),
				selected.candidates.map((c) => c.info.product.id)
			)
		};
	}
	async productDetail(productId: string): Promise<ProductDetail | AtlasError> {
		const found = await this.locateProduct(productId);
		if (!found) return failure('unknown-product', 'Product is not in the catalog.');
		const measurements = found.catalog.measurements.filter((m) => m.productId === productId);
		const rows = await Promise.all(
			measurements.map(async (measurement) => {
				const source = found.catalog.sources.find((s) => s.id === measurement.sourceId);
				if (!source) throw new Error('Measurement has unknown source');
				return {
					measurement,
					source,
					curves: (await this.detailCurves(measurement)).map((c) => ({
						channel: c.channel,
						values: c.values
					}))
				};
			})
		);
		const spread: ProductSpread[] = [],
			variationSpread: ProductSpread[] = [];
		for (const partition of new Set(measurements.map((m) => m.partition))) {
			const variants: IndexedCurve[] = rows
				.filter((r) => r.measurement.partition === partition && r.measurement.variant.kind !== 'tuning')
				.flatMap((r) => {
					const values = channelValues(
						r.curves.map((c) => ({ ...c, measurementId: r.measurement.id })),
						'avg'
					);
					return values ? [{ measurement: r.measurement, values }] : [];
				});
			const defaults = spreadFor(
				variants.filter((v) => v.measurement.variant.kind === 'default'),
				partition
			);
			if (defaults) spread.push(defaults);
			const variation = spreadFor(variants, partition);
			if (variation) variationSpread.push(variation);
		}
		return {
			ok: true,
			product: found.product,
			frequencies: GRID.slice(),
			measurements: rows,
			spread,
			variationSpread
		};
	}
	async curves(
		measurementIds: string[],
		options: { channel: 'avg' | 'L' | 'R' } = { channel: 'avg' }
	): Promise<CurveResult[]> {
		return Promise.all(
			measurementIds.map(async (measurementId) => {
				const found = await this.locateMeasurement(measurementId);
				if (!found)
					return {
						measurementId,
						partition: '',
						channel: options.channel,
						values: null,
						error: 'unknown-measurement'
					};
				const values = channelValues(await this.detailCurves(found.measurement), options.channel);
				return {
					measurementId,
					partition: found.measurement.partition,
					channel: options.channel,
					values,
					error: values ? null : 'channel-unavailable'
				};
			})
		);
	}
	private async detailReference(
		input: Pick<SimilarRequest, 'productId' | 'measurementId' | 'partition'>
	): Promise<{ ok: true; values: Float64Array; partition: string } | AtlasError> {
		const reference = await this.reference({ ...input, harmonise: false });
		if (!reference.ok) return reference;
		const rows: IndexedCurve[] = [];
		for (const id of reference.info.measurementIds) {
			const measurement = reference.index.measurements.get(id)?.measurement;
			if (!measurement) continue;
			const values = channelValues(await this.detailCurves(measurement), 'avg');
			if (values) rows.push({ measurement, values });
		}
		const pooled = consensus(rows, GRID);
		return pooled
			? { ok: true, values: pooled.values, partition: reference.index.partition.id }
			: failure('insufficient-data', 'No usable detail curve.');
	}
	async peq(request: PeqRequest): Promise<PeqResponse | AtlasError> {
		let values: Float64Array,
			partition: string | undefined = request.partition;
		if (request.uploadId) {
			if (request.productId || request.measurementId) throw new RangeError('Choose one reference identity');
			const upload = this.uploads.get(request.uploadId);
			if (!upload) return failure('unknown-upload', 'Upload is not in this service session.');
			values = upload.values;
		} else {
			const reference = await this.detailReference(request);
			if (!reference.ok) return reference;
			values = reference.values;
			partition = reference.partition;
		}
		let target: Curve;
		if (request.target.kind === 'curve') target = request.target.values;
		else if (request.target.kind === 'reference') {
			if (!partition)
				return failure(
					'partition-required',
					'Choose the rig matching the upload before using a reference target.'
				);
			const found = await this.locatePartition(partition);
			if (!found) return failure('not-measured-on-rig', 'Unknown partition.');
			const { targetId } = request.target;
			const reference = (await this.targets(found.catalog.form)).find((t) => t.id === targetId);
			if (!reference) return failure('unknown-target', 'Reference target is not in this form catalog.');
			if (!reference.partitions.includes(partition))
				return failure(
					'not-measured-on-rig',
					'Reference target is not compatible with the measured curve’s rig partition.'
				);
			target = reference.values;
		} else {
			if (request.uploadId && !partition)
				return failure(
					'partition-required',
					'Choose the rig matching the upload before using a measured product target.'
				);
			const reference = await this.detailReference({
				productId: request.target.productId,
				...(partition ? { partition } : {})
			});
			if (!reference.ok) return reference;
			target = reference.values;
			partition = reference.partition;
		}
		const result = fitPeq(
			values,
			target,
			request.maxFilters === undefined ? {} : { maxFilters: request.maxFilters }
		);
		return result
			? {
					ok: true,
					partition: partition ?? null,
					result,
					apo: exportEqualizerApo(result),
					wavelet: exportWavelet(result),
					json: exportPeqJson(result)
				}
			: failure('insufficient-data', 'Insufficient overlapping curve support for PEQ.');
	}
	parseUpload(text: string, name: string): UploadResult {
		const parsed = parseMeasurement(text);
		if (!parsed.ok) return parsed;
		const values = resample(parsed.points),
			smooth = smoothOctave(values, 12);
		const rankValues = scoredCurve(Float64Array.from(RANK_GRID, (_, i) => smooth[i * RANK_STEP] ?? NaN));
		const uploadId = `upload-${++this.nextUpload}`;
		this.uploads.set(uploadId, { values: values.slice(), rankValues: rankValues.slice() });
		return {
			ok: true,
			uploadId,
			name,
			points: parsed.points,
			values,
			rankValues,
			warnings: [
				...parsed.warnings,
				'Rig is not inferred from uploaded text; select a matching partition for dataset comparisons.'
			]
		};
	}
}

/** Public worker contract, without cache implementation details. */
export type Analysis = Pick<
	AtlasService,
	| 'summary'
	| 'products'
	| 'targets'
	| 'measurements'
	| 'similar'
	| 'taste'
	| 'compare'
	| 'productDetail'
	| 'curves'
	| 'peq'
	| 'parseUpload'
>;
