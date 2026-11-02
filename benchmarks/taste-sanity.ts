/** Reproduce the published real-curve sanity checks: node benchmarks/atlas.ts --audit-taste.
 * Profiles are invented, NOT labelled listener preferences. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decodePack, decompressGzip } from '../src/core/dataset/codec.ts';
import type { Catalog } from '../src/core/dataset/types.ts';
import { buildPartitionIndex, type AtlasCandidate } from '../src/core/atlas/index.ts';
import {
	buildTasteModel,
	rankTastePacked,
	type DislikeReason,
	type RatedItem
} from '../src/core/analysis/taste.ts';
import { RANK_GRID } from '../src/core/grid.ts';

const { version } = JSON.parse(await readFile('static/data/manifest.json', 'utf8')) as { version: string };
const root = resolve('static/data', version);
const catalog = JSON.parse(
	new TextDecoder().decode(await decompressGzip(await readFile(resolve(root, 'catalog-iem.json.gz'))))
) as Catalog;
const partition = catalog.partitions.find((p) => p.id === 'iem-711');
if (!partition) throw new Error('Need the iem-711 partition');
const pack = decodePack(await decompressGzip(await readFile(resolve(root, partition.rankFile))));
const index = buildPartitionIndex(catalog, partition, pack); // unharmonised, isolate taste rules
const statistics = index.statistics;
if (!statistics) throw new Error('Need published spread for the recorded audit');
const rows = [...index.products.values()].map((r) => ({
	...r,
	values: Float64Array.from(r.values, Math.fround)
}));
const byId = new Map(rows.map((r) => [r.info.product.id, r]));
type Region = readonly [number, number];
const profiles: {
	liked: string;
	disliked: string;
	reason: DislikeReason;
	region: Region;
	baseline: Region;
	direction: 1 | -1;
}[] = [
	{
		liked: 'p-302d1580eef04c1ee765',
		disliked: 'p-50f19bd11e242df84f1f',
		reason: 'too-much-bass',
		region: [20, 250],
		baseline: [500, 2000],
		direction: 1
	},
	{
		liked: 'p-b5504a1548573c23bab8',
		disliked: 'p-c3870851a7a65d1e1fa0',
		reason: 'too-little-bass',
		region: [20, 250],
		baseline: [500, 2000],
		direction: -1
	},
	{
		liked: 'p-302d1580eef04c1ee765',
		disliked: 'p-50f19bd11e242df84f1f',
		reason: 'bass-lacks-punch',
		region: [20, 60],
		baseline: [80, 250],
		direction: -1
	}
];
function mean(values: readonly number[]): number {
	return values.reduce((a, b) => a + b, 0) / values.length;
}
function band(values: Float64Array, [low, high]: Region): number {
	return mean(
		Array.from(values).filter(
			(v, i) => Number.isFinite(v) && (RANK_GRID[i] ?? NaN) >= low && (RANK_GRID[i] ?? NaN) < high
		)
	);
}
/** Independent weighted LS baseline, not responseDistance/scoring code. */
function plain(a: Float64Array, b: Float64Array, weights: Float64Array): number {
	let sw = 0,
		sd = 0;
	for (let i = 0; i < a.length; i++) {
		const av = a[i] ?? NaN,
			bv = b[i] ?? NaN,
			w = weights[i] ?? 0;
		if (Number.isFinite(av) && Number.isFinite(bv) && w > 0) {
			sw += w;
			sd += w * (av - bv);
		}
	}
	let sq = 0;
	for (let i = 0; i < a.length; i++) {
		const av = a[i] ?? NaN,
			bv = b[i] ?? NaN,
			w = weights[i] ?? 0;
		if (Number.isFinite(av) && Number.isFinite(bv) && w > 0) sq += w * (av - bv - sd / sw) ** 2;
	}
	return Math.sqrt(sq / sw);
}
function item(r: AtlasCandidate, rating: RatedItem['rating'], reason?: DislikeReason): RatedItem {
	return {
		id: r.info.product.id,
		curve: r.values,
		rating,
		strength: 1,
		soundRelated: true,
		...(reason ? { dislikeReasons: [reason] } : {})
	};
}
console.log(
	`Dataset ${version}; ${rows.length} usable iem-711 defaults; no tuning candidates or source correction; top20; invented profiles, no labelled listener data`
);
for (const profile of profiles) {
	const liked = byId.get(profile.liked),
		disliked = byId.get(profile.disliked);
	assert(liked && disliked, 'fixed real profile members exist');
	const options = { frequencies: RANK_GRID, spread: Float64Array.from(statistics.spread, (v) => v ?? NaN) };
	const base = buildTasteModel([item(liked, 'like')], options);
	const model = buildTasteModel([item(liked, 'like'), item(disliked, 'dislike', profile.reason)], options);
	const candidates = rows.filter((r) => ![profile.liked, profile.disliked].includes(r.info.product.id));
	const trait = (r: AtlasCandidate) => band(r.values, profile.region) - band(r.values, profile.baseline);
	const threshold = trait(disliked),
		traits = candidates.map(trait);
	assert(
		profile.direction * (threshold - trait(liked)) > 0,
		'disliked curve is further in the stated direction'
	);
	const matrix = new Float32Array(candidates.flatMap((r) => Array.from(r.values)));
	const plainOrder = candidates
		.map((r, i) => ({ index: i, distance: plain(r.values, liked.values, base.weights) }))
		.filter((r) => Number.isFinite(r.distance))
		.sort((a, b) => a.distance - b.distance || a.index - b.index);
	const baseOrder = rankTastePacked(matrix, base, candidates.length),
		order = rankTastePacked(matrix, model, candidates.length);
	const violators = new Set(traits.flatMap((t, i) => (profile.direction * (t - threshold) > 0.5 ? [i] : [])));
	const rank = (ordered: readonly { index: number }[]) =>
		mean(ordered.flatMap((r, i) => (violators.has(r.index) ? [i + 1] : [])));
	const top = (ordered: readonly { index: number }[]) => ({
		meanTraitDb: mean(ordered.slice(0, 20).map((r) => traits[r.index] ?? NaN)),
		violations: ordered.slice(0, 20).filter((r) => violators.has(r.index)).length
	});
	const groupRank = { plain: rank(plainOrder), positiveOnly: rank(baseOrder), reason: rank(order) };
	assert(violators.size > 0, 'real candidates reach the penalty path');
	assert(groupRank.reason > groupRank.positiveOnly, 'directionally violating candidates lose average rank');
	assert.deepEqual(
		order.slice(0, 20).map((r) => r.index),
		baseOrder.slice(0, 20).map((r) => r.index),
		'these fixed profiles leave the unpenalised top20 unchanged'
	);
	const basePositions = new Map(baseOrder.map((r, i) => [r.index, i]));
	const demoted = order.filter(
		(r, i) => violators.has(r.index) && i > (basePositions.get(r.index) ?? Infinity)
	).length;
	console.log(
		JSON.stringify(
			{
				reason: profile.reason,
				liked: `${liked.info.product.brand} ${liked.info.product.model}`,
				disliked: `${disliked.info.product.brand} ${disliked.info.product.model}`,
				likedTraitDb: trait(liked),
				dislikedTraitDb: threshold,
				candidates: candidates.length,
				violators: violators.size,
				demoted,
				meanViolatorRank: groupRank,
				top20: { plain: top(plainOrder), positiveOnly: top(baseOrder), reason: top(order) }
			},
			null,
			2
		)
	);
}
