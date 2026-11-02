import { RANK_SIZE } from '../grid.ts';
import {
	BANDS,
	bandIndex,
	frequenciesFor,
	median,
	regionMean,
	sameLength,
	weightedMedian,
	type Band,
	type Curve
} from './common.ts';
import { responseDistance, type DistanceResult } from './distance.ts';
import { detectNarrowPeaks } from './peaks.ts';
import { defaultSpreadDb, makeWeights } from './weights.ts';

const TASTE_CLUSTER_DISTANCE_DB = 3;
const DUPLICATE_DISTANCE_DB = 1.5;
const CONSTRAINT_MARGIN_DB = 0.5;
const NARROW_RESIDUAL_CAP_DB = 2;
const NARROW_PENALTY_BUDGET = 0.5;
export type DislikeReason =
	| 'too-much-bass'
	| 'too-little-bass'
	| 'bass-lacks-punch'
	| 'too-much-midbass-warmth'
	| 'muddy-lower-mids'
	| 'thin-or-recessed-vocals'
	| 'shouty-upper-mids'
	| 'sharp-fatiguing-treble'
	| 'sibilance'
	| 'dull-treble'
	| 'tonal-balance-wrong'
	| 'other';

/** Stored ids remain compatible with profiles; labels describe measured correlates, not diagnoses. */
export const DISLIKE_REASON_LABELS: Readonly<Record<DislikeReason, string>> = {
	'too-much-bass': 'Higher 20–250 Hz level relative to 500 Hz–2 kHz',
	'too-little-bass': 'Lower 20–250 Hz level relative to 500 Hz–2 kHz',
	'bass-lacks-punch': 'Lower 20–60 Hz level relative to 80–250 Hz',
	'too-much-midbass-warmth': 'Higher 80–250 Hz level relative to 500 Hz–2 kHz',
	'muddy-lower-mids': 'Higher 250–800 Hz level relative to 500 Hz–2 kHz',
	'thin-or-recessed-vocals': 'Lower 800–2500 Hz level relative to 500 Hz–2 kHz',
	'shouty-upper-mids': 'Higher 2–5 kHz level relative to 500 Hz–2 kHz',
	'sharp-fatiguing-treble': 'Higher 2–10 kHz level relative to 500 Hz–2 kHz',
	sibilance: 'More bounded narrow-residual RMS at 5–9 kHz',
	'dull-treble': 'Lower 5–10 kHz level relative to 500 Hz–2 kHz',
	'tonal-balance-wrong': 'Near-duplicate measured response shape',
	other: 'Near-duplicate measured response shape'
};
function constraintStatement(
	reason: DislikeReason | 'near-duplicate',
	disliked: string,
	candidate: number | null,
	reference: number | null
): string {
	if (reason === 'near-duplicate')
		return `Measured response-shape proximity to ${disliked}; not a perceptual diagnosis.`;
	const metric = DISLIKE_REASON_LABELS[reason].replace(/^(Higher|Lower|More) /, '');
	if (candidate === null || reference === null)
		return `Insufficient measured coverage of ${metric} for comparison with ${disliked}.`;
	const delta = candidate - reference;
	return `${delta === 0 ? 'Equal' : delta > 0 ? 'Higher' : 'Lower'} measured ${metric} than ${disliked} (${Math.abs(delta).toFixed(2)} dB).`;
}
function boundedNarrow(residual: number): number {
	return Math.min(NARROW_RESIDUAL_CAP_DB, Math.max(0, residual));
}
export interface RatedItem {
	id: string;
	curve: Curve;
	rating: 'love' | 'like' | 'neutral' | 'dislike';
	strength: number;
	soundRelated: boolean;
	likedAspects?: readonly ('bass' | 'mids' | 'treble' | 'overall')[];
	dislikeReasons?: readonly DislikeReason[];
}
export interface PreferenceStatement {
	band: Band;
	direction: 'more' | 'less';
	magnitudeDb: [number, number];
	support: number;
}
interface Taste {
	id: number;
	members: RatedItem[];
	centre: Float64Array;
	spread: Float64Array;
	tolerance: Float64Array;
	weights: Float64Array;
	agreementDb: number;
	summary: PreferenceStatement[];
}
export interface TasteConflict {
	kind: 'near-liked-dislike' | 'reason-contradicts-like';
	liked: string;
	disliked: string;
	reason?: DislikeReason;
	distance?: number;
}
export interface TasteModel {
	frequencies: Curve;
	weights: Float64Array;
	spread: Float64Array;
	tastes: Taste[];
	dislikes: RatedItem[];
	conflicts: TasteConflict[];
	confidence: { level: 'limited' | 'moderate' | 'strong'; reasons: string[] };
	/** Prepared once by buildTasteModel; treat models and their input curves as immutable. */
	scoring: PreparedTasteScoring;
}
interface PreparedConstraint {
	disliked: RatedItem;
	reason: DislikeReason | 'near-duplicate';
	trait: number;
	direction: 1 | -1;
	region: Uint16Array;
	baseline: Uint16Array;
}
interface PreparedTasteScoring {
	tasteIndices: Uint16Array[];
	baseIndices: Uint16Array;
	constraints: PreparedConstraint[];
	narrowKernel: Float64Array;
}
export interface TasteOptions {
	frequencies?: Curve;
	spread?: Curve;
	weights?: Curve;
	populationMedian?: Curve;
	clusterThresholdDb?: number;
}

function itemWeight(item: RatedItem): number {
	return item.strength * (item.rating === 'love' ? 2 : 1);
}

function aspectWeight(item: RatedItem, hz: number): number {
	const aspects = item.likedAspects;
	if (!aspects?.length || aspects.includes('overall')) return 1;
	return (hz < 250 && aspects.includes('bass')) ||
		(hz >= 250 && hz < 5000 && aspects.includes('mids')) ||
		(hz >= 5000 && aspects.includes('treble'))
		? 2
		: 1;
}

/** Trait levels are invariant to an arbitrary measurement level. NaN means the trait is not observable. */
export function dislikeTrait(
	curve: Curve,
	reason: DislikeReason,
	frequencies?: Curve
): { value: number; direction: 1 | -1 } | null {
	const f = frequenciesFor(curve, frequencies),
		mid = regionMean(curve, f, 500, 2000);
	let low = 20,
		high = 250,
		direction: 1 | -1 = 1;
	switch (reason) {
		case 'too-little-bass':
			direction = -1;
			break;
		case 'bass-lacks-punch':
			return { value: regionMean(curve, f, 20, 60) - regionMean(curve, f, 80, 250), direction: -1 };
		case 'too-much-midbass-warmth':
			low = 80;
			high = 250;
			break;
		case 'muddy-lower-mids':
			low = 250;
			high = 800;
			break;
		case 'thin-or-recessed-vocals':
			low = 800;
			high = 2500;
			direction = -1;
			break;
		case 'shouty-upper-mids':
			low = 2000;
			high = 5000;
			break;
		case 'sharp-fatiguing-treble':
			low = 2000;
			high = 10000;
			break;
		case 'dull-treble':
			low = 5000;
			high = 10000;
			direction = -1;
			break;
		case 'sibilance': {
			const { narrow } = detectNarrowPeaks(curve, f);
			let sum = 0,
				n = 0;
			for (let i = 0; i < curve.length; i++)
				if ((f[i] ?? 0) >= 5000 && (f[i] ?? Infinity) <= 9000 && Number.isFinite(narrow[i])) {
					sum += boundedNarrow(narrow[i] ?? 0) ** 2;
					n++;
				}
			return { value: n ? Math.sqrt(sum / n) : NaN, direction: 1 };
		}
		case 'tonal-balance-wrong':
		case 'other':
			return null;
		case 'too-much-bass':
			break;
	}
	return { value: regionMean(curve, f, low, high) - mid, direction };
}

function makeSummary(
	taste: Taste,
	population: Curve | undefined,
	f: Curve,
	weights: Curve
): PreferenceStatement[] {
	if (!population || taste.members.length < 2) return [];
	const d = responseDistance(taste.centre, population, { frequencies: f, weights });
	if (!d) return [];
	const statements: PreferenceStatement[] = [];
	for (const band of d.bands) {
		const region = BANDS.find((b) => b.id === band.band);
		if (!region || band.meanDb === null || Math.abs(band.meanDb) < 1.5 || region.low >= 10000) continue;
		const spread = regionMean(taste.spread, f, region.low, region.high);
		if (!(spread <= 1)) continue;
		// Every member must independently support the measured direction, not merely the centre.
		const levels = taste.members.map(
			(m) =>
				responseDistance(m.curve, population, { frequencies: f, weights })?.bands.find(
					(b) => b.band === band.band
				)?.meanDb
		);
		if (
			!levels.every(
				(v) =>
					v !== null && v !== undefined && Math.sign(v) === Math.sign(band.meanDb ?? 0) && Math.abs(v) >= 1
			)
		)
			continue;
		statements.push({
			band: band.band,
			direction: band.meanDb > 0 ? 'more' : 'less',
			magnitudeDb: [
				Math.max(0, Math.abs(band.meanDb) - Math.max(0.5, spread)),
				Math.abs(band.meanDb) + Math.max(0.5, spread)
			],
			support: taste.members.length
		});
	}
	return statements;
}

function frequencyIndices(f: Curve, low: number, high: number, inclusiveHigh = false): Uint16Array {
	const indices: number[] = [];
	for (let i = 0; i < f.length; i++)
		if ((f[i] ?? NaN) >= low && (inclusiveHigh ? (f[i] ?? NaN) <= high : (f[i] ?? NaN) < high))
			indices.push(i);
	return Uint16Array.from(indices);
}

function eligibleIndices(f: Curve, weights: Curve): Uint16Array {
	return frequencyIndices(f, 20, 20000, true).filter(
		(i) => (weights[i] ?? 0) > 0 && Number.isFinite(weights[i])
	);
}

function prepareScoring(
	tastes: Taste[],
	dislikes: RatedItem[],
	f: Curve,
	weights: Curve
): PreparedTasteScoring {
	const constraints: PreparedConstraint[] = [];
	for (const disliked of dislikes) {
		const start = constraints.length;
		for (const reason of disliked.dislikeReasons ?? []) {
			const trait = dislikeTrait(disliked.curve, reason, f);
			if (!trait) continue;
			let low = 20,
				high = 250,
				baseLow = 500,
				baseHigh = 2000;
			switch (reason) {
				case 'bass-lacks-punch':
					high = 60;
					baseLow = 80;
					baseHigh = 250;
					break;
				case 'too-much-midbass-warmth':
					low = 80;
					break;
				case 'muddy-lower-mids':
					low = 250;
					high = 800;
					break;
				case 'thin-or-recessed-vocals':
					low = 800;
					high = 2500;
					break;
				case 'shouty-upper-mids':
					low = 2000;
					high = 5000;
					break;
				case 'sharp-fatiguing-treble':
					low = 2000;
					high = 10000;
					break;
				case 'dull-treble':
					low = 5000;
					high = 10000;
					break;
				case 'sibilance':
					low = 5000;
					high = 9000;
					break;
			}
			constraints.push({
				disliked,
				reason,
				trait: trait.value,
				direction: trait.direction,
				region: frequencyIndices(f, low, high, reason === 'sibilance'),
				baseline: frequencyIndices(f, baseLow, baseHigh)
			});
		}
		if (constraints.length === start)
			constraints.push({
				disliked,
				reason: 'near-duplicate',
				trait: NaN,
				direction: 1,
				region: new Uint16Array(),
				baseline: new Uint16Array()
			});
	}
	const ppo = 1 / Math.log2((f[1] ?? 40) / (f[0] ?? 20)),
		sigma = ppo / 3 / Math.sqrt(2 * Math.PI);
	const radius = Math.max(1, Math.ceil(3 * sigma));
	return {
		tasteIndices: tastes.map((t) => eligibleIndices(f, t.weights)),
		baseIndices: eligibleIndices(f, weights),
		constraints,
		narrowKernel: Float64Array.from({ length: 2 * radius + 1 }, (_, i) =>
			Math.exp(-0.5 * ((i - radius) / sigma) ** 2)
		)
	};
}

function directionalPenalty(z: number, strength: number): number {
	// The shifted softplus is squared so the safe-side join has zero slope.
	const h = z > 0 ? (Math.max(0, 2 * z) + Math.log1p(Math.exp(-Math.abs(2 * z))) - Math.log(2)) * 0.5 : 0;
	return strength * h * h;
}

export function buildTasteModel(items: readonly RatedItem[], options: TasteOptions = {}): TasteModel {
	const threshold = options.clusterThresholdDb ?? TASTE_CLUSTER_DISTANCE_DB;
	if (!Number.isFinite(threshold) || threshold < 0)
		throw new RangeError('Cluster threshold must be finite and nonnegative');
	const first = items[0]?.curve;
	if (!first) throw new RangeError('At least one rated curve is required');
	const frequencies = frequenciesFor(first, options.frequencies);
	if (options.spread) sameLength(first, options.spread);
	if (options.weights) sameLength(first, options.weights);
	if (options.populationMedian) sameLength(first, options.populationMedian);
	for (const item of items) {
		sameLength(item.curve, first);
		if (!(item.strength >= 0 && item.strength <= 1)) throw new RangeError('Strength must be in [0,1]');
	}
	const spread = Float64Array.from(frequencies, (f, i) => {
		const s = options.spread?.[i] ?? NaN;
		return Number.isFinite(s) && s >= 0 ? s : defaultSpreadDb(f);
	});
	const weights = options.weights ? Float64Array.from(options.weights) : makeWeights(frequencies, { spread });
	const positives = items.filter(
		(i) => i.soundRelated && i.strength > 0 && (i.rating === 'love' || i.rating === 'like')
	);
	const dislikes = items.filter((i) => i.soundRelated && i.strength > 0 && i.rating === 'dislike');
	const distances = positives.map((a) =>
		positives.map((b) => responseDistance(a.curve, b.curve, { frequencies, weights })?.distance ?? Infinity)
	);
	const clusters = positives.map((_, i) => [i]);
	while (clusters.length > 1) {
		let best = Infinity,
			ai = -1,
			bi = -1;
		for (let a = 0; a < clusters.length; a++)
			for (let b = a + 1; b < clusters.length; b++) {
				const ca = clusters[a] ?? [],
					cb = clusters[b] ?? [];
				let sum = 0;
				for (const i of ca) for (const j of cb) sum += distances[i]?.[j] ?? Infinity;
				const d = sum / (ca.length * cb.length);
				if (d < best) {
					best = d;
					ai = a;
					bi = b;
				}
			}
		if (best > threshold || ai < 0) break;
		clusters[ai]?.push(...(clusters[bi] ?? []));
		clusters.splice(bi, 1);
	}
	const tastes: Taste[] = clusters.map((indices, id) => {
		const members = indices.map((i) => positives[i]).filter((i): i is RatedItem => i !== undefined);
		const anchor = members[0];
		const aligned = members.map((m) => {
			const d = anchor ? responseDistance(m.curve, anchor.curve, { frequencies, weights }) : null;
			return Float64Array.from(m.curve, (v) => (d ? v - d.offset : NaN));
		});
		const centre = Float64Array.from(frequencies, (f, i) =>
			weightedMedian(
				members.map((m, j) => ({ value: aligned[j]?.[i] ?? NaN, weight: itemWeight(m) * aspectWeight(m, f) }))
			)
		);
		const memberSpread = Float64Array.from(
			frequencies,
			(_, i) =>
				1.4826 *
				weightedMedian(
					members.map((m, j) => ({
						value: Math.abs((aligned[j]?.[i] ?? NaN) - (centre[i] ?? NaN)),
						weight: itemWeight(m)
					}))
				)
		);
		const tolerance = Float64Array.from(spread, (sigma, i) =>
			Math.sqrt(sigma ** 2 + (memberSpread[i] ?? 0) ** 2 + (members.length === 1 ? 2 : 1) ** 2)
		);
		const tasteWeights = Float64Array.from(weights, (w, i) => w / (tolerance[i] ?? Infinity) ** 2);
		const agreement = members.map(
			(m) => responseDistance(m.curve, centre, { frequencies, weights })?.distance ?? Infinity
		);
		const taste: Taste = {
			id,
			members,
			centre,
			spread: memberSpread,
			tolerance,
			weights: tasteWeights,
			agreementDb: median(agreement),
			summary: []
		};
		taste.summary = makeSummary(taste, options.populationMedian, frequencies, weights);
		return taste;
	});
	const conflicts: TasteConflict[] = [];
	for (const disliked of dislikes)
		for (const liked of positives) {
			const d = responseDistance(disliked.curve, liked.curve, { frequencies, weights });
			if (d && d.distance < DUPLICATE_DISTANCE_DB)
				conflicts.push({
					kind: 'near-liked-dislike',
					liked: liked.id,
					disliked: disliked.id,
					distance: d.distance
				});
			for (const reason of disliked.dislikeReasons ?? []) {
				const a = dislikeTrait(liked.curve, reason, frequencies),
					b = dislikeTrait(disliked.curve, reason, frequencies);
				if (a && b && a.direction * (a.value - b.value) > CONSTRAINT_MARGIN_DB)
					conflicts.push({ kind: 'reason-contradicts-like', liked: liked.id, disliked: disliked.id, reason });
			}
		}
	const reasons: string[] = [];
	const typicalSpread = regionMean(spread, frequencies, 20, 8000);
	const measuredSpread =
		!!options.spread &&
		Array.from(frequencies).every(
			(f, i) => f > 8000 || (Number.isFinite(options.spread?.[i]) && (options.spread?.[i] ?? -1) >= 0)
		);
	if (!tastes.length) reasons.push('No sound-related positive ratings; no taste target can be inferred.');
	if (tastes.some((t) => t.members.length < 3))
		reasons.push('At least one taste has fewer than three positive examples.');
	if (tastes.some((t) => t.agreementDb > 1.5)) reasons.push('Positive examples disagree within a taste.');
	if (!measuredSpread) reasons.push('Some cross-source uncertainty uses the conservative default profile.');
	if (typicalSpread > 2) reasons.push('Typical cross-source uncertainty exceeds 2 dB below 8 kHz.');
	if (tastes.some((t) => !Number.isFinite(t.agreementDb)))
		reasons.push('Insufficient overlapping response data in at least one taste.');
	if (conflicts.length) reasons.push('Some positive and negative inputs conflict.');
	const wellSupported =
		tastes.length > 0 &&
		typicalSpread <= 2 &&
		tastes.every((t) => t.members.length >= 3 && t.agreementDb <= 1.5) &&
		!conflicts.length;
	const strong =
		wellSupported &&
		tastes.every((t) => t.members.length >= 5) &&
		measuredSpread &&
		regionMean(spread, frequencies, 20, 8000) <= 1.5;
	return {
		frequencies,
		weights,
		spread,
		tastes,
		dislikes,
		conflicts,
		scoring: prepareScoring(tastes, dislikes, frequencies, weights),
		confidence: {
			level: strong ? 'strong' : wellSupported ? 'moderate' : 'limited',
			reasons: reasons.length ? reasons : ['Several agreeing positive examples support each measured taste.']
		}
	};
}

interface ConstraintExplanation {
	disliked: string;
	reason: DislikeReason | 'near-duplicate';
	penalty: number;
	status: 'satisfied' | 'violated' | 'unknown';
	candidateTrait: number | null;
	dislikedTrait: number | null;
	/** Measured correlate only; legacy reason ids are not perceptual diagnoses. */
	statement: string;
}
export interface TasteFit {
	score: number;
	taste: number;
	fit: number;
	plainDistanceDb: number;
	nearestLiked: { id: string; distanceDb: number } | null;
	penalty: number;
	constraints: ConstraintExplanation[];
	bands: DistanceResult['bands'];
	uncertainRegions: { low: number; high: number; reason: string }[];
}

export function scoreTasteCandidate(curve: Curve, model: TasteModel): TasteFit | null {
	const f = model.frequencies;
	sameLength(curve, f);
	let best: { taste: Taste; d: DistanceResult } | null = null;
	for (const taste of model.tastes) {
		const d = responseDistance(curve, taste.centre, { frequencies: f, weights: taste.weights });
		if (d && (!best || d.distance < best.d.distance)) best = { taste, d };
	}
	if (!best) return null;
	const plain = responseDistance(curve, best.taste.centre, { frequencies: f, weights: model.weights });
	if (!plain) return null;
	let nearestLiked: TasteFit['nearestLiked'] = null;
	for (const taste of model.tastes)
		for (const liked of taste.members) {
			const d = responseDistance(curve, liked.curve, { frequencies: f, weights: model.weights });
			if (d && (!nearestLiked || d.distance < nearestLiked.distanceDb))
				nearestLiked = { id: liked.id, distanceDb: d.distance };
		}
	const constraints: ConstraintExplanation[] = [];
	let narrowBudget = NARROW_PENALTY_BUDGET;
	for (const constraint of model.scoring.constraints) {
		const { disliked, reason } = constraint;
		if (reason === 'near-duplicate') {
			const d = responseDistance(curve, disliked.curve, { frequencies: f, weights: model.weights });
			const penalty = d ? disliked.strength * Math.exp(-((d.distance / DUPLICATE_DISTANCE_DB) ** 2)) : 0;
			constraints.push({
				disliked: disliked.id,
				reason: 'near-duplicate',
				penalty,
				status: d ? (penalty > 0.1 ? 'violated' : 'satisfied') : 'unknown',
				candidateTrait: null,
				dislikedTrait: null,
				statement: constraintStatement(reason, disliked.id, null, null)
			});
		} else {
			const a = dislikeTrait(curve, reason, f);
			const observed = a && Number.isFinite(a.value) && Number.isFinite(constraint.trait);
			const z = observed ? a.direction * (a.value - constraint.trait) - CONSTRAINT_MARGIN_DB : -Infinity;
			const rawPenalty = directionalPenalty(z, disliked.strength);
			const penalty =
				reason === 'sibilance'
					? Math.min(narrowBudget, disliked.strength * NARROW_PENALTY_BUDGET, rawPenalty)
					: rawPenalty;
			if (reason === 'sibilance') narrowBudget -= penalty;
			constraints.push({
				disliked: disliked.id,
				reason,
				penalty,
				status: !observed ? 'unknown' : z > 0 ? 'violated' : 'satisfied',
				candidateTrait: observed ? a.value : null,
				dislikedTrait: observed ? constraint.trait : null,
				statement: constraintStatement(
					reason,
					disliked.id,
					observed ? a.value : null,
					observed ? constraint.trait : null
				)
			});
		}
	}
	const penalty = constraints.reduce((s, c) => s + c.penalty, 0);
	const uncertainRegions: TasteFit['uncertainRegions'] = [
		{ low: 8000, high: 20000, reason: 'Insertion and rig uncertainty above 8 kHz.' }
	];
	for (const band of BANDS)
		if (regionMean(model.spread, f, band.low, band.high) > 2)
			uncertainRegions.push({ low: band.low, high: band.high, reason: 'Cross-source spread exceeds 2 dB.' });
	return {
		score: best.d.distance + penalty,
		taste: best.taste.id,
		fit: best.d.distance,
		plainDistanceDb: plain.distance,
		nearestLiked,
		penalty,
		constraints,
		bands: plain.bands,
		uncertainRegions
	};
}

/** Stable two-pass moments with precompiled eligibility; NaN denotes insufficient overlap. */
function packedDistance(
	matrix: Float32Array,
	start: number,
	reference: Curve,
	weights: Curve,
	indices: Uint16Array
): number {
	let sw = 0,
		se = 0,
		count = 0;
	for (const i of indices) {
		const e = (matrix[start + i] ?? NaN) - (reference[i] ?? NaN);
		if (!Number.isFinite(e)) continue;
		const w = weights[i] ?? 0;
		sw += w;
		se += w * e;
		count++;
	}
	if (!sw || count < 12 || count / indices.length < 0.5) return NaN;
	const offset = se / sw;
	let sse = 0;
	for (const i of indices) {
		const e = (matrix[start + i] ?? NaN) - (reference[i] ?? NaN) - offset;
		if (Number.isFinite(e)) sse += (weights[i] ?? 0) * e * e;
	}
	return Math.sqrt(sse / sw);
}

function enoughOverlap(matrix: Float32Array, start: number, reference: Curve, indices: Uint16Array): boolean {
	let count = 0;
	for (const i of indices) if (Number.isFinite((matrix[start + i] ?? NaN) - (reference[i] ?? NaN))) count++;
	return count >= 12 && count / indices.length >= 0.5;
}

function packedRegionMean(matrix: Float32Array, start: number, indices: Uint16Array): number {
	let sum = 0,
		n = 0;
	for (const i of indices) {
		const v = matrix[start + i] ?? NaN;
		if (Number.isFinite(v)) {
			sum += v;
			n++;
		}
	}
	return n ? sum / n : NaN;
}

function packedTrait(
	matrix: Float32Array,
	start: number,
	constraint: PreparedConstraint,
	kernel: Float64Array
): number {
	if (constraint.reason !== 'sibilance')
		return (
			packedRegionMean(matrix, start, constraint.region) -
			packedRegionMean(matrix, start, constraint.baseline)
		);
	const radius = (kernel.length - 1) / 2;
	let sum = 0,
		n = 0;
	for (const i of constraint.region) {
		const centre = matrix[start + i] ?? NaN;
		if (!Number.isFinite(centre)) continue;
		let smooth = 0,
			weight = 0;
		for (let j = Math.max(0, i - radius); j <= Math.min(RANK_SIZE - 1, i + radius); j++) {
			const v = matrix[start + j] ?? NaN;
			if (!Number.isFinite(v)) continue;
			const w = kernel[j - i + radius] ?? 0;
			smooth += w * v;
			weight += w;
		}
		const narrow = centre - smooth / weight;
		if (Number.isFinite(narrow)) {
			sum += boundedNarrow(narrow) ** 2;
			n++;
		}
	}
	return n ? Math.sqrt(sum / n) : NaN;
}

function packedTasteScore(matrix: Float32Array, start: number, model: TasteModel): number {
	const prepared = model.scoring;
	let best = Infinity,
		bestTaste: Taste | undefined;
	for (let j = 0; j < model.tastes.length; j++) {
		const taste = model.tastes[j],
			indices = prepared.tasteIndices[j];
		if (!taste || !indices) continue;
		const distance = packedDistance(matrix, start, taste.centre, taste.weights, indices);
		if (distance < best) {
			best = distance;
			bestTaste = taste;
		}
	}
	// The explanatory scorer also requires sufficient ordinary-weight overlap with the best taste.
	if (!bestTaste || !enoughOverlap(matrix, start, bestTaste.centre, prepared.baseIndices)) return NaN;
	let penalty = 0,
		narrowBudget = NARROW_PENALTY_BUDGET;
	for (const constraint of prepared.constraints) {
		if (constraint.reason === 'near-duplicate') {
			const d = packedDistance(matrix, start, constraint.disliked.curve, model.weights, prepared.baseIndices);
			if (Number.isFinite(d))
				penalty += constraint.disliked.strength * Math.exp(-((d / DUPLICATE_DISTANCE_DB) ** 2));
		} else {
			const value = packedTrait(matrix, start, constraint, prepared.narrowKernel);
			const z =
				Number.isFinite(value) && Number.isFinite(constraint.trait)
					? constraint.direction * (value - constraint.trait) - CONSTRAINT_MARGIN_DB
					: -Infinity;
			const raw = directionalPenalty(z, constraint.disliked.strength);
			const increment =
				constraint.reason === 'sibilance'
					? Math.min(narrowBudget, constraint.disliked.strength * NARROW_PENALTY_BUDGET, raw)
					: raw;
			if (constraint.reason === 'sibilance') narrowBudget -= increment;
			penalty += increment;
		}
	}
	return best + penalty;
}

/** Allocation-free N-row scalar scan, O(N log K) heap, full explanations only for K winners. */
export function rankTastePacked(
	matrix: Float32Array,
	model: TasteModel,
	topK = 20
): { index: number; fit: TasteFit }[] {
	if (matrix.length % RANK_SIZE || model.frequencies.length !== RANK_SIZE)
		throw new RangeError('Expected N × 120 ranking matrix and model');
	if (!Number.isInteger(topK) || topK < 0) throw new RangeError('topK must be a nonnegative integer');
	const n = matrix.length / RANK_SIZE,
		k = Math.min(n, topK);
	if (!k || !model.tastes.length) return [];
	const indices = new Int32Array(k),
		scores = new Float64Array(k);
	let size = 0;
	for (let row = 0; row < n; row++) {
		const score = packedTasteScore(matrix, row * RANK_SIZE, model);
		if (!Number.isFinite(score) || (size === k && score >= (scores[0] ?? Infinity))) continue;
		let pos = size < k ? size++ : 0;
		if (pos) {
			while (pos > 0) {
				const parent = (pos - 1) >> 1,
					parentScore = scores[parent] ?? 0,
					parentIndex = indices[parent] ?? 0;
				if (parentScore > score || (parentScore === score && parentIndex > row)) break;
				scores[pos] = parentScore;
				indices[pos] = parentIndex;
				pos = parent;
			}
		} else {
			while (2 * pos + 1 < size) {
				let child = 2 * pos + 1;
				const leftScore = scores[child] ?? 0,
					rightScore = scores[child + 1] ?? 0;
				if (
					child + 1 < size &&
					(rightScore > leftScore ||
						(rightScore === leftScore && (indices[child + 1] ?? 0) > (indices[child] ?? 0)))
				)
					child++;
				const childScore = scores[child] ?? 0,
					childIndex = indices[child] ?? 0;
				if (childScore < score || (childScore === score && childIndex < row)) break;
				scores[pos] = childScore;
				indices[pos] = childIndex;
				pos = child;
			}
		}
		scores[pos] = score;
		indices[pos] = row;
	}
	const matches: { index: number; fit: TasteFit }[] = [];
	for (let i = 0; i < size; i++) {
		const index = indices[i] ?? 0,
			fit = scoreTasteCandidate(matrix.subarray(index * RANK_SIZE, (index + 1) * RANK_SIZE), model);
		if (fit) matches.push({ index, fit });
	}
	return matches.sort((a, b) => a.fit.score - b.fit.score || a.index - b.index);
}

/** Returns a corrected copy; learned spread/confidence remain evidence-based, not changed by a correction. */
export function correctTaste(
	model: TasteModel,
	tasteId: number,
	adjustments: Partial<Record<Band, number>>
): TasteModel {
	if (!model.tastes.some((t) => t.id === tasteId)) throw new RangeError('Unknown taste');
	for (const v of Object.values(adjustments))
		if (!Number.isFinite(v)) throw new RangeError('Adjustment must be finite');
	return {
		...model,
		tastes: model.tastes.map((t) =>
			t.id !== tasteId
				? t
				: {
						...t,
						centre: Float64Array.from(t.centre, (v, i) => {
							const band = BANDS[bandIndex(model.frequencies[i] ?? NaN)];
							return v + (band ? (adjustments[band.id] ?? 0) : 0);
						})
					}
		)
	};
}

export function renderPreference(statement: PreferenceStatement, formFactor = 'IEM'): string {
	const [lo, hi] = statement.magnitudeDb;
	return `Your ${statement.support} examples suggest a measured preference for ${statement.direction} ${statement.band} (about ${lo.toFixed(1)}–${hi.toFixed(1)} dB), relative to the typical ${formFactor} in this dataset.`;
}
