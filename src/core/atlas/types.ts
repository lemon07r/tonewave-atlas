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
export interface AtlasError {
	ok: false;
	error:
		| 'not-measured-on-rig'
		| 'unknown-product'
		| 'unknown-measurement'
		| 'unknown-upload'
		| 'partition-required'
		| 'insufficient-data';
	message: string;
}
export interface PartitionSummary {
	id: string;
	form: Form;
	measurementCount: number;
	productCount: number;
}
export interface SourceSummary extends Source {
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
export interface MeasurementInfo {
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
	sourceCount: number;
	measurementCount: number;
	variantLabels: string[];
	priceUsd: [number, number] | null;
	/** Reviewer-listed USD prices with their source and crawl date; one per source and amount. */
	prices: NonNullable<Measurement['price']>[];
}
export interface CandidateInfo {
	id: string;
	product: Pick<Product, 'id' | 'brand' | 'model' | 'form'>;
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
export interface RankFilters {
	maxPriceUsd?: number;
	minPriceUsd?: number;
	sources?: string[];
	/** Include tuning candidates, including the reference product's tunings in similar(). */
	includeTunings?: boolean;
}
export interface SimilarRequest {
	productId?: string;
	measurementId?: string;
	uploadId?: string;
	partition?: string;
	focus?: Focus;
	customBands?: Partial<Record<Band, number>>;
	treblePenalty?: number;
	harmonise?: boolean;
	filters?: RankFilters;
	topK?: number;
}
export interface SimilarMatch extends DistanceResult {
	candidate: CandidateInfo;
	perSourceRange: [number, number] | null;
	/** Sources with adequate overlap for this query's per-source distance, not all catalog sources. */
	sourceCount: number;
	sameProduct: boolean;
}
export interface SimilarResult {
	ok: true;
	partition: string;
	reference: ReferenceInfo;
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
	corrections?: { tasteId: number; bands: Partial<Record<Band, number>> }[];
	filters?: RankFilters;
	topK?: number;
}
export interface UnusedTasteItem {
	productId: string;
	measurementId: string | null;
	reason: string;
}
export interface TasteResult {
	ok: true;
	partition: string;
	model: {
		tastes: {
			id: number;
			members: string[];
			centre: Float64Array;
			summary: PreferenceStatement[];
			statements: string[];
		}[];
		confidence: TasteModel['confidence'];
		conflicts: TasteConflict[];
	};
	unusedItems: UnusedTasteItem[];
	results: { candidate: CandidateInfo; fit: TasteFit }[];
	caveats: string[];
}
export interface CompareRequest {
	productIds: string[];
	partition?: string;
	focus?: Focus;
}
export interface CompareResult {
	ok: true;
	partition: string;
	references: ReferenceInfo[];
	results: { candidate: CandidateInfo; tradeoff: MultiReferenceResult }[];
	caveats: string[];
}
export interface DetailMeasurement {
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
export interface ProductDetail {
	ok: true;
	product: Product;
	frequencies: Float64Array;
	measurements: DetailMeasurement[];
	spread: ProductSpread[];
	/** Defaults plus fit/setup/unit/unknown variants; separate from default cross-source spread. */
	variationSpread: ProductSpread[];
}
export interface CurveResult {
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
		| { kind: 'curve'; values: number[] | Float32Array | Float64Array };
	maxFilters?: number;
}
export interface PeqResponse {
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
