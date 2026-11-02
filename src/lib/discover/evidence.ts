import { responseDistance, type BandDistance } from '#core/analysis/distance.ts';
import type {
	CompareResult,
	MeasurementInfo,
	ProductListItem,
	SourceMode,
	TasteResult
} from '#core/atlas/types.ts';
import type { WorkspaceItem } from '#lib/profile/profile.ts';

/** Nearest-member distance uses its returned curve and row-specific offset, not a detail consensus. */
export function nearestLikedEvidence(
	result: TasteResult,
	row: TasteResult['results'][number]
): { id: string; distanceDb: number } | null {
	const liked = row.nearestLiked;
	if (!liked) return null;
	const aligned = Float64Array.from(row.rankCurve, (value) => value - liked.offsetDb);
	const distance = responseDistance(aligned, liked.rankCurve, {
		frequencies: result.rankFrequencies,
		weights: result.rankWeights
	});
	return distance ? { id: liked.id, distanceDb: distance.distance } : null;
}

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
	status: 'available' | 'missing-rig' | 'unknown-measurement' | 'unknown-product' | 'unavailable';
}
/** Explicit measurements are checked against their own product and rig; never substitute defaults. */
export function referenceDiagnostic(
	item: WorkspaceItem,
	product: ProductListItem | undefined,
	measurements: readonly MeasurementInfo[],
	partition: string,
	filter?: { selected: readonly string[]; mode: SourceMode }
): ReferenceDiagnostic {
	const measurement = item.measurementId
		? measurements.find((m) => m.id === item.measurementId && m.productId === item.productId)
		: undefined;
	const only = filter?.mode === 'only' && filter.selected.length > 0;
	const partitions = item.measurementId
		? measurement
			? only && !filter.selected.includes(measurement.sourceId)
				? []
				: [measurement.partition]
			: []
		: only
			? [
					...new Set(
						measurements
							.filter(
								(m) =>
									m.productId === item.productId &&
									m.variantKind === 'default' &&
									filter.selected.includes(m.sourceId)
							)
							.map((m) => m.partition)
					)
				]
			: (product?.defaultPartitions ?? []);
	return {
		partitions,
		variant: measurement?.variantLabel || (item.measurementId ? item.measurementId : null),
		status: !product
			? 'unknown-product'
			: item.measurementId && !measurement
				? 'unknown-measurement'
				: !partitions.length
					? 'unavailable'
					: partition && !partitions.includes(partition)
						? 'missing-rig'
						: 'available'
	};
}
