/** Pure query preparation/selection shared by ranking orchestration, independent of dataset loading. */
import { BANDS, type Curve } from '../analysis/common.ts';
import type { DistanceOptions } from '../analysis/distance.ts';
import { makeWeights } from '../analysis/weights.ts';
import { RANK_GRID, RANK_SIZE } from '../grid.ts';
import type { AtlasCandidate, PartitionIndex } from './index.ts';
import type { RankFilters, SimilarRequest, SourceMode } from './types.ts';

export function topK(value = 20): number {
	if (!Number.isInteger(value) || value < 0) throw new RangeError('topK must be a nonnegative integer');
	return value;
}
export function treblePenalty(value = 1): number {
	if (!Number.isFinite(value) || value < 1)
		throw new RangeError('treblePenalty must be finite and at least 1');
	return value;
}
export function sourceMode(filters: RankFilters = {}): SourceMode {
	if (filters.sourceMode !== undefined && !['coverage', 'only'].includes(filters.sourceMode))
		throw new RangeError('sourceMode must be coverage or only');
	if (filters.sourceMode === 'only' && !filters.sources?.length)
		throw new RangeError('sourceMode only requires selected sources');
	return filters.sourceMode ?? 'coverage';
}
export function selectedSources(filters: RankFilters = {}): string[] | undefined {
	return sourceMode(filters) === 'only' ? [...new Set(filters.sources)].sort() : undefined;
}
export function statisticCurve(values: readonly (number | null)[]): Float64Array {
	return Float64Array.from(values, (value) => value ?? NaN);
}
export function scoredCurve(values: Curve): Float64Array {
	return Float64Array.from(values, (value) => {
		const rounded = Math.fround(value);
		return Number.isFinite(rounded) ? rounded : NaN;
	});
}
export function alignedCurve(values: Curve, offset: number): Float64Array {
	return Float64Array.from(values, (value) => (Number.isFinite(value) ? value - offset : NaN));
}
export function rankingCaveats(
	index: PartitionIndex,
	references: readonly string[] = [],
	candidates: readonly string[] = []
): string[] {
	const notes = [
		'Measured response shape is not a prediction of sound quality, fit or preference.',
		'Never compare across rig partitions. Insertion and rig uncertainty increase above 8 kHz.'
	];
	if (!index.statistics)
		notes.push(
			'Cross-source statistics are absent; reliability uses the conservative default spread, not measured uncertainty.'
		);
	else {
		const spread = index.statistics.spread;
		const fallbackBands = BANDS.filter((band) =>
			RANK_GRID.some((hz, i) => {
				const value = spread[i];
				return hz >= band.low && hz < band.high && (value == null || !Number.isFinite(value) || value < 0);
			})
		).map((band) => band.id);
		if (fallbackBands.length)
			notes.push(
				`Cross-source spread is missing or invalid in ${fallbackBands.join(', ')}; reliability uses the conservative default spread there, not measured uncertainty.`
			);
	}
	if (index.harmonised)
		notes.push('Available estimated source offsets were subtracted; this is not physical rig calibration.');
	if (index.sourceIds) {
		notes.push(
			'Source-only pooling uses selected measurements; reliability and reviewer offsets remain published partition-wide estimates, not re-estimated statistics.'
		);
		if (references.some((id) => index.excludedSourceProducts.has(id)))
			notes.push('Unselected source measurements were excluded from reference pooling.');
		if (candidates.some((id) => index.excludedSourceProducts.has(id)))
			notes.push('Unselected source measurements were excluded from candidate pooling.');
	}
	return notes;
}
export function distanceOptions(
	index: PartitionIndex,
	settings: Pick<SimilarRequest, 'focus' | 'customBands' | 'treblePenalty'> = {}
): DistanceOptions & { weights: Float64Array; treblePenalty: number } {
	return {
		frequencies: RANK_GRID,
		treblePenalty: treblePenalty(settings.treblePenalty),
		weights: makeWeights(RANK_GRID, {
			...(index.statistics ? { spread: statisticCurve(index.statistics.spread) } : {}),
			...(settings.focus ? { focus: settings.focus } : {}),
			...(settings.customBands ? { bandMultipliers: settings.customBands } : {})
		})
	};
}
export function selection(
	index: PartitionIndex,
	filters: RankFilters = {},
	excluded = new Set<string>(),
	ownTunings = false,
	excludedMeasurementId?: string
): { candidates: AtlasCandidate[]; matrix: Float32Array } {
	for (const price of [filters.minPriceUsd, filters.maxPriceUsd])
		if (price !== undefined && (!Number.isFinite(price) || price < 0))
			throw new RangeError('Price bounds must be finite and nonnegative');
	if (
		filters.minPriceUsd !== undefined &&
		filters.maxPriceUsd !== undefined &&
		filters.minPriceUsd > filters.maxPriceUsd
	)
		throw new RangeError('Price bounds are reversed');
	const candidates: AtlasCandidate[] = [],
		indices: number[] = [];
	index.candidates.forEach((c, i) => {
		if (excludedMeasurementId && c.info.measurementIds.includes(excludedMeasurementId)) return;
		if (c.info.kind === 'tuning' && !filters.includeTunings) return;
		if (
			excluded.has(c.info.product.id) &&
			!(ownTunings && c.info.kind === 'tuning' && filters.includeTunings)
		)
			return;
		if (filters.sources?.length && !c.info.sources.some((s) => filters.sources?.includes(s.id))) return;
		if (
			(filters.minPriceUsd !== undefined || filters.maxPriceUsd !== undefined) &&
			!c.info.prices.some(
				(p) =>
					p.usd !== null && p.usd >= (filters.minPriceUsd ?? 0) && p.usd <= (filters.maxPriceUsd ?? Infinity)
			)
		)
			return;
		candidates.push(c);
		indices.push(i);
	});
	const matrix = new Float32Array(candidates.length * RANK_SIZE);
	indices.forEach((row, i) => {
		matrix.set(index.matrix.subarray(row * RANK_SIZE, (row + 1) * RANK_SIZE), i * RANK_SIZE);
	});
	return { candidates, matrix };
}
