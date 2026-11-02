import type { HarmonisationValidation } from '../analysis/statistics.ts';

export type Form = 'iem' | 'headphone';
export type VariantKind = 'default' | 'tuning' | 'fit' | 'setup' | 'unit' | 'unknown';

export interface Source {
	id: string;
	username: string;
	name: string;
	url: string;
	dbType: string;
	form: Form;
	partition: string;
	rig: string | null;
	rigInferred: boolean;
	permission: 'public, not explicitly licensed' | 'permission granted';
	crawledAt: string;
	calibration: string | null;
}

export interface Product {
	id: string;
	brand: string;
	model: string;
	form: Form;
	measurementIds: string[];
}

export interface Variant {
	id: string;
	label: string;
	file: string;
	kind: VariantKind;
	isDefault: boolean;
}

export interface Provenance {
	sourceId: string;
	databaseUrl: string;
	originalUrls: string[];
	processing: string[];
	calibrationUrl: string | null;
}

export interface Measurement {
	id: string;
	productId: string;
	sourceId: string;
	partition: string;
	variant: Variant;
	channels: string[];
	/** Bitmask on GRID: 0 missing, 1 L, 2 R, 3 paired. */
	channelContributions: number[];
	imbalanceDb: number | null;
	/** Finite paired bins inside 100 Hz–10 kHz used for imbalanceDb, not the full-grid paired count. */
	pairedBins: number;
	/** Verbatim REW dates per channel, not inferred UTC timestamps. */
	dated: Record<string, string | null>;
	lastModified: Record<string, string | null>;
	price: { raw: string; usd: number | null; sourceId: string; crawledAt: string } | null;
	reviewUrl: string | null;
	detailFile: string;
	provenance: Provenance;
	warnings: string[];
}

/** Rank-grid estimates; null bins are unsupported, never invented zero spread/offsets. */
export interface PartitionStatistics {
	spread: (number | null)[];
	populationMedian: (number | null)[];
	sourceOffsets: Record<string, (number | null)[]>;
	/** Optional for compatibility with earlier TWFR v1 JSON metadata. */
	support?: {
		status: 'sufficient' | 'low';
		reason: string | null;
		minimumProducts: number;
		multiSourceProducts: number;
		sources: number;
		spread: number[];
		sourceProducts: Record<string, number>;
		sourceBins: Record<string, number[]>;
	};
	harmonisation?: HarmonisationValidation;
}

export interface Partition {
	id: string;
	form: Form;
	measurementCount: number;
	rankFile: string;
	detailFiles: string[];
	statistics: PartitionStatistics | null;
}

export interface Catalog {
	formatVersion: 1;
	form: Form;
	products: Product[];
	measurements: Measurement[];
	sources: Source[];
	partitions: Partition[];
}

export interface DatasetFile {
	path: string;
	sha256: string;
	bytes: number;
}

export interface ReferenceTarget {
	id: string;
	name: string;
	partitions: string[];
	form: Form;
	description: string;
	attribution: string;
	/** Relative dB on the canonical GRID, with no smoothing or level normalization. */
	values: number[];
}

export interface Manifest {
	formatVersion: 1;
	version: string;
	builtAt: string;
	files: DatasetFile[];
	sources: Source[];
}
