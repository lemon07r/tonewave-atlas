/** Reviewer sensitivity, keeping actual ranking scores/order untouched. No joint omissions or chaining. */
import type { Curve } from '../analysis/common.ts';
import { distanceSummary, type DistanceOptions } from '../analysis/distance.ts';
import { RANK_GRID } from '../grid.ts';
import { consensus, type AtlasCandidate, type IndexedCurve } from './index.ts';
import { scoredCurve } from './ranking.ts';
import type { RankStability } from './types.ts';

export const STABILITY_MARGIN = 10;
export const STABILITY_CAVEAT =
	'Rank ranges measure leave-one-reviewer-out sensitivity within the returned topK plus up to 10 further rows, not confidence intervals. Sides with fewer than 3 contributing reviewers are unassessed; a narrow range is not evidence of stability there. Unit variation and perceptual difference are not assessed.';

// Index candidates are immutable and partition/source/harmonisation-specific. Weak keys let evicted
// source-only indexes release their variants; no consensus is rebuilt on a resident repeat query.
const variants = new WeakMap<AtlasCandidate, readonly Float64Array[]>();
export function reviewerVariants(candidate?: AtlasCandidate): readonly Float64Array[] {
	if (!candidate?.consensusInputs || candidate.info.sources.length < 3) return [];
	const cached = variants.get(candidate);
	if (cached) return cached;
	// The same pair keeps the same adequacy/distance after an omission. Reuse only those medoid
	// comparisons; anchor choice, LS alignment and the full measurement median are rebuilt exactly.
	const pairDistances = new WeakMap<IndexedCurve, WeakMap<IndexedCurve, number | null>>();
	const result = candidate.info.sources.flatMap((source) => {
		const pooled = consensus(
			candidate.consensusInputs?.filter((c) => c.measurement.sourceId !== source.id) ?? [],
			RANK_GRID,
			pairDistances
		);
		return pooled ? [scoredCurve(pooled.values)] : [];
	});
	variants.set(candidate, result);
	return result;
}

export interface StabilityRow {
	candidate: AtlasCandidate;
	/** Actual packed candidate, not its aligned display curve. */
	values: Curve;
	score: number;
	/** Reuse compare objectives: a reference omission changes only its own objective. */
	distances: readonly number[];
}

export function rankingStability(
	rows: readonly StabilityRow[],
	references: readonly { values: Curve; candidate?: AtlasCandidate }[],
	options: DistanceOptions,
	combination: 'mean' | 'minimax' = 'mean'
): (RankStability | undefined)[] {
	if (!rows.length) return [];
	const referenceVariants = references.map((r) => reviewerVariants(r.candidate));
	const combine = (distances: readonly number[]) =>
		combination === 'minimax'
			? Math.max(...distances)
			: distances.reduce((sum, d) => sum + d, 0) / distances.length;
	const intervals = rows.map((row) => {
		const candidateVariants = reviewerVariants(row.candidate);
		let lo = row.score,
			hi = row.score;
		let referenceSide = false,
			candidateSide = false;
		const include = (score: number) => {
			lo = Math.min(lo, score);
			hi = Math.max(hi, score);
		};
		referenceVariants.forEach((curves, i) => {
			for (const curve of curves) {
				const d = distanceSummary(row.values, curve, options);
				if (d && Number.isFinite(d.distance)) {
					referenceSide = true;
					include(combine(row.distances.map((value, j) => (i === j ? d.distance : value))));
				}
			}
		});
		for (const curve of candidateVariants) {
			const distances = references.map((r) => distanceSummary(curve, r.values, options)?.distance);
			if (distances.every((d): d is number => d !== undefined && Number.isFinite(d))) {
				candidateSide = true;
				include(combine(distances));
			}
		}
		return { lo, hi, referenceSide, candidateSide };
	});
	return intervals.map(({ lo, hi, referenceSide, candidateSide }) =>
		referenceSide || candidateSide
			? {
					scoreRange: [lo, hi],
					rankRange: [
						1 + intervals.filter((other) => other.hi < lo).length,
						intervals.filter((other) => other.lo <= hi).length
					],
					referenceSide,
					candidateSide
				}
			: undefined
	);
}
