import { median } from '#core/analysis/common.ts';
import { responseDistance } from '#core/analysis/distance.ts';
import { consensus, type IndexedCurve } from '#core/atlas/index.ts';
import { RANK_GRID } from '#core/grid.ts';
import type { Source } from '#core/dataset/types.ts';
import { sha256 } from './common.ts';

interface Direction {
	delta: number[];
	intervals: [number, number][];
	mask: boolean[];
	products: number;
	support: number[];
}
interface RigScore {
	source: string;
	configRig: string | null;
	control: '711' | '5128' | null;
	sharedProducts: number;
	distanceDb: number | null;
	projection: number | null;
	interval: [number, number] | null;
	directionProducts: number;
	directionBins: number;
	class: 'verified' | 'evidenced' | 'unknown';
	family: '711' | '5128' | null;
}

function random(key: string): () => number {
	let seed = parseInt(sha256(key).slice(0, 8), 16) || 1;
	return () => {
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		return (seed >>> 0) / 4294967296;
	};
}

function bounds(values: number[]): [number, number] {
	values = values.filter(Number.isFinite).sort((a, b) => a - b);
	return [
		values[Math.floor(values.length * 0.025)] ?? NaN,
		values[Math.ceil(values.length * 0.975) - 1] ?? NaN
	];
}

const medianCurve = (rows: readonly ArrayLike<number>[]): number[] =>
	Array.from(RANK_GRID, (_, i) => median(rows.map((row) => row[i] ?? NaN)));

function residual(a: ArrayLike<number>, b: ArrayLike<number>): number[] | null {
	const distance = responseDistance(a, b, { frequencies: RANK_GRID });
	return distance ? Array.from(a, (v, i) => v - (b[i] ?? NaN) - distance.offset) : null;
}

function bootstrap(rows: number[][], key: string, iterations: number): number[][][] {
	const next = random(key);
	return Array.from({ length: iterations }, () =>
		Array.from({ length: rows.length }, () => rows[Math.floor(next() * rows.length)] ?? [])
	);
}

/** Signed projection, not a new distance metric; all level alignment/consensus uses the engine. */
function projection(rows: number[][], direction: Direction): number {
	const r = medianCurve(rows);
	let numerator = 0,
		denominator = 0,
		points = 0;
	for (let i = 0; i < r.length; i++) {
		const delta = direction.delta[i] ?? NaN,
			value = r[i] ?? NaN;
		if (direction.mask[i] && Number.isFinite(value)) {
			points++;
			numerator += value * delta;
			denominator += delta * delta;
		}
	}
	return denominator && points >= direction.mask.filter(Boolean).length / 2 ? numerator / denominator : NaN;
}

/** Unknown hardware remains visible, but never silently joins a shared ranking partition. */
export function rigEvidence(sources: Source[], curves: IndexedCurve[], iterations = 500) {
	const sorted = [...curves].sort((a, b) => a.measurement.id.localeCompare(b.measurement.id, 'en'));
	const byProduct = new Map<string, IndexedCurve[]>();
	for (const row of sorted) {
		if (row.measurement.variant.kind !== 'default') continue;
		const group = byProduct.get(row.measurement.productId) ?? [];
		if (!group.some((r) => r.measurement.sourceId === row.measurement.sourceId)) group.push(row);
		byProduct.set(row.measurement.productId, group);
	}
	const family = new Map(
		sources.filter((s) => s.rigEvidence?.class === 'verified').map((s) => [s.id, s.rigEvidence?.family])
	);
	const directionFor = (exclude: string): Direction => {
		const differences: number[][] = [];
		for (const rows of byProduct.values()) {
			const a = consensus(
				rows.filter(
					(r) => r.measurement.sourceId !== exclude && family.get(r.measurement.sourceId) === '711'
				),
				RANK_GRID
			);
			const b = consensus(
				rows.filter(
					(r) => r.measurement.sourceId !== exclude && family.get(r.measurement.sourceId) === '5128'
				),
				RANK_GRID
			);
			const difference = a && b ? residual(b.values, a.values) : null;
			if (difference) differences.push(difference);
		}
		const delta = medianCurve(differences);
		const boot = bootstrap(differences, `direction:${exclude}`, iterations).map(medianCurve);
		const intervals = Array.from(RANK_GRID, (_, i) => bounds(boot.map((r) => r[i] ?? NaN)));
		const support = Array.from(RANK_GRID, (_, i) => differences.filter((d) => Number.isFinite(d[i])).length);
		return {
			delta,
			intervals,
			mask: intervals.map(
				([lo, hi], i) => (support[i] ?? 0) >= Math.max(2, differences.length / 2) && (lo > 0 || hi < 0)
			),
			support,
			products: differences.length
		};
	};
	const direction = directionFor('');
	const details = sources.map((source) => {
		const control = family.get(source.id) ?? null;
		const vector = control ? directionFor(source.id) : direction;
		const residuals: number[][] = [],
			distances: number[] = [];
		for (const rows of byProduct.values()) {
			const own = rows.find((r) => r.measurement.sourceId === source.id);
			const others = rows.filter(
				(r) => r.measurement.sourceId !== source.id && family.get(r.measurement.sourceId) === '711'
			);
			if (!own || others.length < 3) continue;
			const ref = consensus(others, RANK_GRID);
			const r = ref ? residual(own.values, ref.values) : null;
			const d = ref ? responseDistance(own.values, ref.values, { frequencies: RANK_GRID }) : null;
			if (r && d) {
				residuals.push(r);
				distances.push(d.distance);
			}
		}
		const value = residuals.length ? projection(residuals, vector) : NaN;
		const interval = Number.isFinite(value)
			? bounds(bootstrap(residuals, `score:${source.id}`, iterations).map((rs) => projection(rs, vector)))
			: null;
		const score: RigScore = {
			source: source.id,
			configRig: source.rigEvidence?.configRig === undefined ? source.rig : source.rigEvidence.configRig,
			control,
			sharedProducts: residuals.length,
			distanceDb: distances.length ? median(distances) : null,
			projection: Number.isFinite(value) ? value : null,
			interval,
			directionProducts: vector.products,
			directionBins: vector.mask.filter(Boolean).length,
			class: control ? 'verified' : 'unknown',
			family: control
		};
		return { score, vector, residuals };
	});
	const controls = details.filter((d) => d.score.control && d.score.interval);
	const a = controls.filter((d) => d.score.control === '711'),
		b = controls.filter((d) => d.score.control === '5128');
	const upper711 = Math.max(...a.map((d) => d.score.interval?.[1] ?? Infinity));
	const lower5128 = Math.min(...b.map((d) => d.score.interval?.[0] ?? -Infinity));
	const scoreGap =
		Math.min(...b.map((d) => d.score.projection ?? -Infinity)) -
		Math.max(...a.map((d) => d.score.projection ?? Infinity));
	const typicalWidth = median(
		controls.map((d) => (d.score.interval?.[1] ?? NaN) - (d.score.interval?.[0] ?? NaN))
	);
	const separated = a.length >= 3 && b.length >= 2 && lower5128 > upper711 && scoreGap > 3 * typicalWidth;
	const threshold = separated ? (upper711 + lower5128) / 2 : null;
	// Fixed, nested candidate sizes. Require >=99% correct on EVERY eligible control, not pooled accuracy.
	const stability = [4, 8, 12, 16, 20, 24, 32].map((n) => {
		const eligible = controls.filter((d) => d.residuals.length >= n);
		const results = eligible.map((d) => {
			const next = random(`stability:${d.score.source}:${n}`);
			let correct = 0;
			for (let trial = 0; trial < 200; trial++) {
				const indices = Array.from({ length: d.residuals.length }, (_, i) => i);
				for (let i = 0; i < n; i++) {
					const j = i + Math.floor(next() * (indices.length - i));
					[indices[i], indices[j]] = [indices[j] ?? 0, indices[i] ?? 0];
				}
				const value = projection(
					indices.slice(0, n).map((i) => d.residuals[i] ?? []),
					d.vector
				);
				if (threshold !== null && (d.score.control === '711' ? value < threshold : value > threshold))
					correct++;
			}
			return { source: d.score.source, correct, trials: 200 };
		});
		return {
			products: n,
			controls: results,
			passes:
				separated &&
				eligible.filter((d) => d.score.control === '5128').length >= 2 &&
				results.every((r) => r.correct >= 198)
		};
	});
	const minimumProducts = stability.find((s) => s.passes)?.products ?? null;
	for (const { score } of details) {
		if (
			!score.control &&
			threshold !== null &&
			minimumProducts !== null &&
			score.sharedProducts >= minimumProducts &&
			score.interval
		) {
			if (score.interval[1] < threshold - 1e-9) {
				score.class = 'evidenced';
				score.family = '711';
			} else if (score.interval[0] > threshold + 1e-9) {
				score.class = 'evidenced';
				score.family = '5128';
			}
		}
	}
	return {
		method: `product-bootstrap signed projection onto 5128-minus-711 aligned consensus; 95% percentile intervals; ${iterations} replicates; direction CI excludes zero and >=50% product support; >=3 other verified 711 sources per product; controls leave source out of both direction and reference`,
		direction,
		threshold,
		minimumProducts,
		separated,
		separation: { upper711, lower5128, scoreGap, typicalWidth },
		stability,
		sources: details.map((d) => d.score)
	};
}
