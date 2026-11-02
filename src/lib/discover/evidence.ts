import { responseDistance, type BandDistance } from '#core/analysis/distance.ts';
import type { CompareResult, MeasurementInfo, ProductListItem } from '#core/atlas/types.ts';
import type { WorkspaceItem } from '#lib/profile/profile.ts';

/** Use the engine's rank weights and independently align to each reference, never detail curves. */
export function compareEvidence(
	result: CompareResult,
	curve: Float64Array,
	names: string[]
): { label: string; bands: BandDistance[] }[] {
	return result.references.map((reference, i) => ({
		label: names[i] ?? `Reference ${i + 1}`,
		bands:
			responseDistance(curve, reference.rankCurve, {
				frequencies: result.rankFrequencies,
				weights: result.rankWeights,
				treblePenalty: result.treblePenalty
			})?.bands ?? []
	}));
}

export interface ReferenceDiagnostic {
	partitions: string[];
	variant: string | null;
	status: 'available' | 'missing-rig' | 'unknown-measurement' | 'unknown-product';
}
/** Explicit measurements are checked against their own product and rig; never substitute defaults. */
export function referenceDiagnostic(
	item: WorkspaceItem,
	product: ProductListItem | undefined,
	measurements: readonly MeasurementInfo[],
	partition: string
): ReferenceDiagnostic {
	const measurement = item.measurementId
		? measurements.find((m) => m.id === item.measurementId && m.productId === item.productId)
		: undefined;
	const partitions = item.measurementId
		? measurement
			? [measurement.partition]
			: []
		: (product?.defaultPartitions ?? []);
	return {
		partitions,
		variant: measurement?.variantLabel || (item.measurementId ? item.measurementId : null),
		status: !product
			? 'unknown-product'
			: item.measurementId && !measurement
				? 'unknown-measurement'
				: partition && !partitions.includes(partition)
					? 'missing-rig'
					: 'available'
	};
}
