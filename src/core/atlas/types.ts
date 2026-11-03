import type { Band } from '../analysis/common.ts';
import type { DistanceResult } from '../analysis/distance.ts';
import type { MultiReferenceResult } from '../analysis/multi-reference.ts';
import type { PeqResult } from '../analysis/peq.ts';
import type {
	RatedItem,
	PreferenceStatement,
	TasteConflict,
	TasteFit,
	TasteModel
} from '../analysis/taste.ts';
import type { Focus } from '../analysis/weights.ts';
import type { Form, Manifest, Measurement, Product, Source } from '../dataset/types.ts';
import type { MeasurementPoints } from '../measurement/parse.ts';

export interface AtlasOptions {
	baseUrl: string;
	fetch: typeof globalThis.fetch;
	/** Maximum decoded detail shards; catalogs and rank indexes stay resident. Default 8. */
	detailCacheSize?: number;
}
/** Changed request identities, so callers can migrate saved links/profile entries. */
export interface IdResolution {
	productId?: string;
	measurementId?: string;
	canonicalProductId: string;
	canonicalMeasurementId?: string;
}
interface ResolvedIds {
	resolvedIds?: IdResolution[];
}
export interface AtlasError extends ResolvedIds {
	ok: false;
	error:
		| 'not-measured-on-rig'
		| 'unknown-product'
		| 'unknown-measurement'
		| 'unknown-upload'
		| 'unknown-target'
		| 'partition-required'
		| 'insufficient-data';
	message: string;
	/** Partitions supporting every requested reference, including explicitly selected variants. */
	partitions?: string[];
}
interface PartitionSummary {
	id: string;
	form: Form;
	measurementCount: number;
	productCount: number;
}
interface SourceSummary extends Source {
	/** Accepted measurements from this source in the published catalog. */
	measurementCount: number;
}
export interface AtlasSummary {
	version: Manifest['version'];
	builtAt: string;
	sources: SourceSummary[];
	partitions: PartitionSummary[];
}
/** Display metadata for one measurement, without curves. */
export interface MeasurementInfo extends ResolvedIds {
	id: string;
	productId: string;
	brand: string;
	model: string;
	partition: string;
	sourceId: string;
	sourceName: string;
	variantLabel: string;
	variantKind: Measurement['variant']['kind'];
}
export interface ProductListItem {
	id: string;
	brand: string;
	model: string;
	partitions: string[];
	/** Rigs with default measurements eligible for product consensus and product-target EQ. */
	defaultPartitions: string[];
	sourceCount: number;
	measurementCount: number;
	variantLabels: string[];
	priceUsd: [number, number] | null;
	/** Reviewer-listed USD prices with their source and crawl date; one per source and amount. */
	prices: NonNullable<Measurement['price']>[];
}
export interface CandidateInfo {
	id: string;
	product: Pick<Product, 'id' | 'brand' | 'model' | 'form' | 'modified' | 'baseProductId'>;
	kind: 'default' | 'tuning';
	variantLabel: string | null;
	measurementIds: string[];
	sources: Source[];
	prices: NonNullable<Measurement['price']>[];
	priceUsd: [number, number] | null;
}
export interface ReferenceInfo {
	productId: string | null;
	uploadId: string | null;
	measurementIds: string[];
	sources: Source[];
}
export type SourceMode = 'coverage' | 'only';
export interface RankFilters {
	maxPriceUsd?: number;
	minPriceUsd?: number;
	sources?: string[];
	/** coverage (default): eligibility only; only: pool reference/candidate measurements from these sources. */
	sourceMode?: SourceMode;
	/** Include tuning candidates, including the reference product's tunings in similar(). */
	includeTunings?: boolean;
	/** Include modified, DIY and prototype products. Default false. */
	includeModified?: boolean;
	/** Minimum distinct contributing reviewers on the active rig/source pool. Default 1. */
	minReviewers?: number;
}
/** Leave-one-reviewer-out sensitivity within the evaluated topK + 10 rows, not a confidence interval. */
export interface RankStability {
	scoreRange: [number, number];
	rankRange: [number, number];
	referenceSide: boolean;
	/** Assessment per reference in request order; referenceSide remains true if any side is assessed. */
	referenceSides?: boolean[];
	candidateSide: boolean;
}
interface SimilarSettings {
	partition?: string;
	focus?: Focus;
	customBands?: Partial<Record<Band, number>>;
	/** Finite multiplier >= 1. The service rejects invalid input rather than relying on engine clamping. */
	treblePenalty?: number;
	harmonise?: boolean;
	filters?: RankFilters;
	topK?: number;
}
/** A product reference, an explicit measurement (optionally checked against its product), or an upload. */
export type SimilarRequest = SimilarSettings &
	(
		| { productId: string; measurementId?: string; uploadId?: never }
		| { productId?: never; measurementId: string; uploadId?: never }
		| { productId?: never; measurementId?: never; uploadId: string }
	);
export interface SimilarMatch extends DistanceResult {
	candidate: CandidateInfo;
	/** Scored packed values minus offsetDb, on rankFrequencies; missing bins stay NaN. */
	rankCurve: Float64Array;
	/** LS offset subtracted from the candidate (also available as DistanceResult.offset). */
	offsetDb: number;
	perSourceRange: [number, number] | null;
	/** Distinct consensus-contributing reviewers on the active rig/source pool, as used by minReviewers. */
	sourceCount: number;
	/** Sources with a valid query-specific distance; present only when different from sourceCount, even if the range is null. */
	rangeSourceCount?: number;
	sameProduct: boolean;
	stability?: RankStability;
	relatedToReference?: true;
}
export interface SimilarResult extends ResolvedIds {
	ok: true;
	partition: string;
	harmonised: boolean;
	sourceMode: SourceMode;
	rankFrequencies: Float64Array;
	rankWeights: Float64Array;
	treblePenalty: number;
	reference: ReferenceInfo & { rankCurve: Float64Array };
	results: SimilarMatch[];
	caveats: string[];
}
export interface TasteItem extends Omit<RatedItem, 'id' | 'curve'> {
	productId: string;
	measurementId?: string;
}
export interface TasteRequest {
	items: TasteItem[];
	partition?: string;
	harmonise?: boolean;
	corrections?: { tasteId: number; bands: Partial<Record<Band, number>> }[];
	filters?: RankFilters;
	topK?: number;
}
export interface UnusedTasteItem {
	productId: string;
	measurementId: string | null;
	reason: string;
}
export interface TasteResult extends ResolvedIds {
	ok: true;
	partition: string;
	harmonised: boolean;
	sourceMode: SourceMode;
	rankFrequencies: Float64Array;
	rankWeights: Float64Array;
	model: {
		tastes: {
			id: number;
			members: string[];
			/** Derived rank-basis centre, including requested corrections; not a detail measurement. */
			centre: Float64Array;
			fitWeights: Float64Array;
			summary: PreferenceStatement[];
			statements: string[];
		}[];
		confidence: TasteModel['confidence'];
		conflicts: TasteConflict[];
	};
	unusedItems: UnusedTasteItem[];
	results: {
		candidate: CandidateInfo;
		fit: TasteFit;
		/** Exact scored liked-member curve; offsetDb aligns this row's returned rankCurve to it. */
		nearestLiked: { id: string; rankCurve: Float64Array; offsetDb: number } | null;
		tasteId: number;
		/** Scored packed values aligned to this taste centre with ordinary rankWeights. */
		rankCurve: Float64Array;
		offsetDb: number;
		relatedToReference?: true;
	}[];
	caveats: string[];
}
export type CompareRequest = SimilarSettings &
	(
		| { references: { productId: string; measurementId?: string }[]; productIds?: never }
		| { references?: never; /** Legacy product-only references. */ productIds: string[] }
	) & {
		sort?: 'mean' | 'minimax';
		paretoOnly?: boolean;
	};
export interface CompareResult extends ResolvedIds {
	ok: true;
	partition: string;
	harmonised: boolean;
	sourceMode: SourceMode;
	rankFrequencies: Float64Array;
	rankWeights: Float64Array;
	treblePenalty: number;
	references: (ReferenceInfo & { rankCurve: Float64Array })[];
	results: {
		candidate: CandidateInfo;
		tradeoff: MultiReferenceResult;
		/** Scored packed values aligned to references[alignedTo]; unaligned when alignedTo is null. Each objective refits its own LS offset. */
		rankCurve: Float64Array;
		/** Zero when alignedTo is null; this does not claim that the raw curve is aligned. */
		offsetDb: number;
		/** Index into references; null means rankCurve is unaligned and must not be overlaid as aligned. */
		alignedTo: number | null;
		stability?: RankStability;
		relatedToReference?: true;
	}[];
	/** Counts before paretoOnly/topK, after candidate filters and reference-product exclusion. */
	counts: { candidates: number; pareto: number };
	caveats: string[];
}
interface DetailMeasurement {
	measurement: Measurement;
	source: Source;
	curves: { channel: string; values: Float64Array }[];
}
export interface ProductSpread {
	partition: string;
	measurementIds: string[];
	sourceCount: number;
	centre: Float64Array;
	min: Float64Array;
	max: Float64Array;
	/** Finite contributing measurements per frequency, not independent listener samples. */
	support: Uint16Array;
}
export interface ProductDetail extends ResolvedIds {
	ok: true;
	product: Product;
	frequencies: Float64Array;
	measurements: DetailMeasurement[];
	spread: ProductSpread[];
	/** Defaults plus fit/setup/unit/unknown variants; separate from default cross-source spread. */
	variationSpread: ProductSpread[];
}
export interface CurveResult extends ResolvedIds {
	measurementId: string;
	partition: string;
	channel: 'avg' | 'L' | 'R';
	values: Float64Array | null;
	error: string | null;
}
export interface PeqRequest {
	productId?: string;
	measurementId?: string;
	uploadId?: string;
	partition?: string;
	target:
		| { kind: 'product'; productId: string }
		| { kind: 'reference'; targetId: string }
		| { kind: 'curve'; values: number[] | Float32Array | Float64Array };
	maxFilters?: number;
}
export interface PeqResponse extends ResolvedIds {
	ok: true;
	partition: string | null;
	result: PeqResult;
	apo: string;
	wavelet: string;
	json: string;
}
export type UploadResult =
	| { ok: false; error: string; warnings: string[] }
	| {
			ok: true;
			uploadId: string;
			name: string;
			points: MeasurementPoints;
			values: Float64Array;
			rankValues: Float64Array;
			warnings: string[];
	  };
