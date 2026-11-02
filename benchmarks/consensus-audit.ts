/** Reproduce the published anchor audit: node benchmarks/atlas.ts --audit-consensus. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decodePack, decompressGzip } from '../src/core/dataset/codec.ts';
import type { Catalog } from '../src/core/dataset/types.ts';
import { distanceSummary } from '../src/core/analysis/distance.ts';
import { consensus, type IndexedCurve } from '../src/core/atlas/index.ts';
import { RANK_GRID } from '../src/core/grid.ts';

const { version } = JSON.parse(await readFile('static/data/manifest.json', 'utf8')) as { version: string };
const root = resolve('static/data', version);
function median(values: readonly number[]): number {
	const sorted = values.filter(Number.isFinite).sort((a, b) => a - b),
		n = sorted.length;
	return n ? ((sorted[Math.floor((n - 1) / 2)] ?? NaN) + (sorted[Math.floor(n / 2)] ?? NaN)) / 2 : NaN;
}
/** Exact phase-1 first-adequate algorithm, including original pack iteration order. */
function oldConsensus(rows: readonly IndexedCurve[]): Float64Array | null {
	const anchor = rows.find((r) => distanceSummary(r.values, r.values, { frequencies: RANK_GRID }));
	if (!anchor) return null;
	const aligned = rows.flatMap((r) => {
		const d = distanceSummary(r.values, anchor.values, { frequencies: RANK_GRID });
		return d ? [Float64Array.from(r.values, (v) => v - d.offset)] : [];
	});
	return Float64Array.from(RANK_GRID, (_, i) => median(aligned.map((r) => r[i] ?? NaN)));
}
const totals = {
	pairs: 0,
	multiMeasurement: 0,
	shapeOverHalf: 0,
	rawOverHalf: 0,
	supportChanged: 0,
	availabilityChanged: 0
};
const unique = new Set<string>(),
	affected = new Set<string>();
const largest: { partition: string; id: string; name: string; rows: number; rms: number; raw: number }[] = [];
console.log(
	`Dataset ${version}; unharmonised default rank consensus; uniform LS-aligned RMS over common finite bins`
);
for (const form of ['iem', 'headphone']) {
	const catalog = JSON.parse(
		new TextDecoder().decode(await decompressGzip(await readFile(resolve(root, `catalog-${form}.json.gz`))))
	) as Catalog;
	const names = new Map(catalog.products.map((p) => [p.id, `${p.brand} ${p.model}`]));
	for (const partition of catalog.partitions) {
		const pack = decodePack(await decompressGzip(await readFile(resolve(root, partition.rankFile))));
		const metadata = new Map(catalog.measurements.map((m) => [m.id, m])),
			groups = new Map<string, IndexedCurve[]>();
		for (const curve of pack.curves) {
			const measurement = metadata.get(curve.measurementId);
			if (!measurement || measurement.variant.kind !== 'default' || curve.channel !== 'avg') continue;
			const rows = groups.get(measurement.productId) ?? [];
			rows.push({ measurement, values: curve.values });
			groups.set(measurement.productId, rows);
		}
		let pairs = 0,
			changed = 0,
			max = 0;
		for (const [id, rows] of groups) {
			const old = oldConsensus(rows),
				now = consensus(rows, RANK_GRID)?.values;
			if (!!old !== !!now) totals.availabilityChanged++;
			if (!old || !now) continue;
			pairs++;
			totals.pairs++;
			unique.add(id);
			if (rows.length > 1) totals.multiMeasurement++;
			if (old.some((v, i) => Number.isFinite(v) !== Number.isFinite(now[i]))) totals.supportChanged++;
			const deltas = Array.from(old, (v, i) => v - (now[i] ?? NaN)).filter(Number.isFinite);
			const level = deltas.reduce((a, b) => a + b, 0) / deltas.length;
			const rms = Math.sqrt(deltas.reduce((a, b) => a + (b - level) ** 2, 0) / deltas.length);
			const raw = Math.sqrt(deltas.reduce((a, b) => a + b * b, 0) / deltas.length);
			max = Math.max(max, rms);
			if (raw > 0.5) totals.rawOverHalf++;
			if (rms > 0.5) {
				changed++;
				totals.shapeOverHalf++;
				affected.add(id);
			}
			largest.push({ partition: partition.id, id, name: names.get(id) ?? id, rows: rows.length, rms, raw });
		}
		console.log(JSON.stringify({ partition: partition.id, pairs, shapeOverHalf: changed, maxShapeRms: max }));
	}
}
console.log(
	JSON.stringify(
		{
			totals,
			uniqueProducts: unique.size,
			affectedUniqueProducts: affected.size,
			largest: largest.sort((a, b) => b.rms - a.rms).slice(0, 10)
		},
		null,
		2
	)
);
