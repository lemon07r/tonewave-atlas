import { smoothOctave } from '../smooth.ts';
import { frequenciesFor, median, sameLength, type Curve } from './common.ts';
import { responseDistance } from './distance.ts';

export interface SourceMeasurement {
	source: string;
	curve: Curve;
}
export interface ProductMeasurements {
	id: string;
	measurements: readonly SourceMeasurement[];
	fitVariants?: readonly Curve[];
}
export interface SourceOffset {
	source: string;
	curve: Float64Array;
	products: number;
	support: Uint32Array;
}
export interface PartitionStatistics {
	spread: Float64Array;
	spreadSupport: Uint32Array;
	sourceOffsets: SourceOffset[];
	populationMedian: Float64Array;
	fitSensitivity: { product: string; spread: Float64Array; meanDistance: number | null }[];
}

function align(curves: readonly Curve[], f: Curve): Float64Array[] {
	const anchor = curves[0];
	if (!anchor) return [];
	return curves.map((curve) => {
		sameLength(curve, f);
		const d = responseDistance(curve, anchor, { frequencies: f });
		return Float64Array.from(curve, (v) => (d ? v - d.offset : NaN));
	});
}

function consensus(curves: readonly Curve[], n: number): Float64Array {
	return Float64Array.from({ length: n }, (_, i) => median(curves.map((c) => c[i] ?? NaN)));
}

/** One row per product/source. Products, not measurements, receive equal population weight. */
export function estimatePartitionStatistics(
	products: readonly ProductMeasurements[],
	frequencies: Curve,
	shrinkage = 10
): PartitionStatistics {
	if (!(shrinkage >= 0 && Number.isFinite(shrinkage))) throw new RangeError('Invalid shrinkage');
	const n = frequencies.length;
	const spreadByFrequency: number[][] = Array.from({ length: n }, () => []);
	const offsets = new Map<string, Float64Array[]>();
	const population: Float64Array[] = [];
	const fitSensitivity: PartitionStatistics['fitSensitivity'] = [];
	for (const product of products) {
		if (new Set(product.measurements.map((m) => m.source)).size !== product.measurements.length)
			throw new RangeError('Duplicate product/source');
		const curves = align(
			product.measurements.map((m) => m.curve),
			frequencies
		);
		if (!curves.length) continue;
		const centre = consensus(curves, n);
		population.push(centre);
		if (curves.length >= 2) {
			// Align to product consensus before measuring residual spread.
			const aligned = curves.map((c) => {
				const d = responseDistance(c, centre, { frequencies });
				return Float64Array.from(c, (v) => (d ? v - d.offset : NaN));
			});
			for (let i = 0; i < n; i++) {
				const values = aligned.map((c) => c[i] ?? NaN).filter(Number.isFinite);
				if (values.length < 2) continue;
				const m = median(values);
				// Finite-consensus variance correction; Gaussian MAD calibration is asymptotic.
				spreadByFrequency[i]?.push(
					1.4826 * median(values.map((v) => Math.abs(v - m))) * Math.sqrt(values.length / (values.length - 1))
				);
			}
			for (let j = 0; j < curves.length; j++) {
				const own = curves[j],
					source = product.measurements[j]?.source;
				if (!own || !source) continue;
				const loo = consensus(
					curves.filter((_, k) => k !== j),
					n
				);
				const d = responseDistance(own, loo, { frequencies });
				if (!d) continue;
				const list = offsets.get(source) ?? [];
				// Convert own-vs-peer to own-vs-all: with two sources the raw contrast is twice the
				// deviation from their centre. Without this factor, unshrunk correction swaps them.
				list.push(
					Float64Array.from(
						own,
						(v, i) => ((v - (loo[i] ?? NaN) - d.offset) * (curves.length - 1)) / curves.length
					)
				);
				offsets.set(source, list);
			}
		}
		if (product.fitVariants?.length) {
			const variants = align(product.fitVariants, frequencies);
			const c = consensus(variants, n);
			const ds = variants
				.map((v) => responseDistance(v, c, { frequencies })?.distance)
				.filter((v): v is number => v !== undefined);
			fitSensitivity.push({
				product: product.id,
				spread: Float64Array.from({ length: n }, (_, i) => {
					const values = variants.map((v) => v[i] ?? NaN).filter(Number.isFinite),
						m = median(values);
					return values.length >= 2 ? 1.4826 * median(values.map((v) => Math.abs(v - m))) : NaN;
				}),
				meanDistance: ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null
			});
		}
	}
	const ppo = 1 / Math.log2((frequencies[1] ?? 40) / (frequencies[0] ?? 20));
	const sourceOffsets = [...offsets].map(([source, curves]) => {
		const support = Uint32Array.from(
			{ length: n },
			(_, i) => curves.filter((c) => Number.isFinite(c[i])).length
		);
		const smoothed = smoothOctave(consensus(curves, n), 3, ppo);
		return {
			source,
			products: curves.length,
			support,
			curve: Float64Array.from(smoothed, (v, i) => {
				const count = support[i] ?? 0;
				return count ? (v * count) / (count + shrinkage) : NaN;
			})
		};
	});
	// Product curves need a common level before taking a population median.
	const alignedPopulation = align(population, frequencies);
	return {
		spread: Float64Array.from(spreadByFrequency, (v) => median(v)),
		spreadSupport: Uint32Array.from(spreadByFrequency, (v) => v.length),
		sourceOffsets,
		populationMedian: consensus(alignedPopulation, n),
		fitSensitivity
	};
}

export interface HarmonisationValidation {
	pairs: number;
	meanBefore: number | null;
	meanAfter: number | null;
	improved: boolean | null;
}

/** Every held-out product is excluded from BOTH offset estimation and its smoothing/shrinkage support. */
export function validateSourceOffsets(
	products: readonly ProductMeasurements[],
	frequencies?: Curve,
	shrinkage = 10
): HarmonisationValidation {
	const first = products.flatMap((p) => p.measurements)[0]?.curve;
	if (!first) return { pairs: 0, meanBefore: null, meanAfter: null, improved: null };
	const f = frequenciesFor(first, frequencies);
	let before = 0,
		after = 0,
		pairs = 0;
	for (const product of products) {
		const training = estimatePartitionStatistics(
			products.filter((p) => p.id !== product.id),
			f,
			shrinkage
		);
		const corrected = product.measurements.map((m) => {
			const offset = training.sourceOffsets.find((s) => s.source === m.source)?.curve;
			return Float64Array.from(
				m.curve,
				(v, i) => v - (Number.isFinite(offset?.[i]) ? (offset?.[i] ?? 0) : 0)
			);
		});
		for (let i = 0; i < corrected.length; i++)
			for (let j = i + 1; j < corrected.length; j++) {
				const a = product.measurements[i]?.curve,
					b = product.measurements[j]?.curve,
					ca = corrected[i],
					cb = corrected[j];
				if (!a || !b || !ca || !cb) continue;
				const raw = responseDistance(a, b, { frequencies: f }),
					adjusted = responseDistance(ca, cb, { frequencies: f });
				if (!raw || !adjusted) continue;
				before += raw.distance;
				after += adjusted.distance;
				pairs++;
			}
	}
	return {
		pairs,
		meanBefore: pairs ? before / pairs : null,
		meanAfter: pairs ? after / pairs : null,
		improved: pairs ? after < before : null
	};
}
