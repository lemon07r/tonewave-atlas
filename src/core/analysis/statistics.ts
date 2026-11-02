import { smoothOctave } from '../smooth.ts';
import { frequenciesFor, median, sameLength, type Curve } from './common.ts';
import { responseDistance } from './distance.ts';

interface SourceMeasurement {
	source: string;
	curve: Curve;
}
export interface ProductMeasurements {
	id: string;
	measurements: readonly SourceMeasurement[];
	fitVariants?: readonly Curve[];
}
interface SourceOffset {
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
	let anchor: Curve | undefined,
		bestCoverage = -1;
	for (const curve of curves) {
		sameLength(curve, f);
		let coverage = 0;
		for (let i = 0; i < curve.length; i++)
			if ((f[i] ?? NaN) >= 20 && (f[i] ?? NaN) <= 20000 && Number.isFinite(curve[i])) coverage++;
		if (coverage > bestCoverage) {
			bestCoverage = coverage;
			anchor = curve;
		}
	}
	if (!anchor) return [];
	return curves.map((curve) => {
		const d = responseDistance(curve, anchor, { frequencies: f });
		return Float64Array.from(curve, (v) => (d ? v - d.offset : NaN));
	});
}

function validateSources(product: ProductMeasurements): void {
	if (new Set(product.measurements.map((m) => m.source)).size !== product.measurements.length)
		throw new RangeError('Duplicate product/source');
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
		validateSources(product);
		const curves = align(
			product.measurements.map((m) => m.curve),
			frequencies
		);
		if (!curves.length) continue;
		const centre = consensus(curves, n);
		population.push(centre);
		if (curves.length >= 2) {
			const finiteSources = Uint32Array.from({ length: n }, (_, i) =>
				curves.reduce((count, curve) => count + Number(Number.isFinite(curve[i])), 0)
			);
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
					Float64Array.from(own, (v, i) => {
						const m = finiteSources[i] ?? 0;
						return m >= 2 && Number.isFinite(v) ? ((v - (loo[i] ?? NaN) - d.offset) * (m - 1)) / m : NaN;
					})
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
				meanDistance: ds.length >= 2 ? ds.reduce((a, b) => a + b, 0) / ds.length : null
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

interface HarmonisationSummary {
	pairs: number;
	meanBefore: number | null;
	meanAfter: number | null;
	/** Positive means correction reduced same-product response distance, in dB. */
	meanImprovement: number | null;
	medianImprovement: number | null;
	improved: boolean | null;
}
interface HarmonisationFold extends HarmonisationSummary {
	fold: number;
	trainingProducts: number;
	heldOutProducts: number;
}
export interface HarmonisationValidation extends HarmonisationSummary {
	foldCount: number;
	folds: HarmonisationFold[];
}

/** FNV-1a over UTF-16 code units: stable across process, input order and runtime. */
function productFold(id: string, foldCount: number): number {
	let hash = 2166136261;
	for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
	return (hash >>> 0) % foldCount;
}

function validationSummary(
	before: number,
	after: number,
	improvements: readonly number[]
): HarmonisationSummary {
	const pairs = improvements.length;
	return {
		pairs,
		meanBefore: pairs ? before / pairs : null,
		meanAfter: pairs ? after / pairs : null,
		meanImprovement: pairs ? improvements.reduce((sum, d) => sum + d, 0) / pairs : null,
		medianImprovement: pairs ? median(improvements) : null,
		improved: pairs ? after < before : null
	};
}

/** Deterministic product K-fold CV; every held-out fold is excluded from all training statistics. */
export function validateSourceOffsets(
	products: readonly ProductMeasurements[],
	frequencies?: Curve,
	shrinkage = 10,
	foldCount = 5
): HarmonisationValidation {
	if (!Number.isInteger(foldCount) || foldCount < 2) throw new RangeError('Use at least two folds');
	if (!(shrinkage >= 0 && Number.isFinite(shrinkage))) throw new RangeError('Invalid shrinkage');
	for (const product of products) validateSources(product);
	const ordered = [...products].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	const first = ordered.find((p) => p.measurements.length)?.measurements[0]?.curve;
	const f = first ? frequenciesFor(first, frequencies) : frequencies;
	const assignments = ordered.map((p) => productFold(p.id, foldCount));
	const folds: HarmonisationFold[] = [],
		improvements: number[] = [];
	let overallBefore = 0,
		overallAfter = 0;
	for (let fold = 0; fold < foldCount; fold++) {
		const heldOut = ordered.filter((_, i) => assignments[i] === fold);
		const trainingProducts = ordered.length - heldOut.length;
		let before = 0,
			after = 0;
		const foldImprovements: number[] = [];
		if (f && heldOut.length) {
			const training = estimatePartitionStatistics(
				ordered.filter((_, i) => assignments[i] !== fold),
				f,
				shrinkage
			);
			const offsets = new Map(training.sourceOffsets.map((s) => [s.source, s.curve]));
			for (const product of heldOut) {
				const corrected = product.measurements.map((m) => {
					const offset = offsets.get(m.source);
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
						foldImprovements.push(raw.distance - adjusted.distance);
					}
			}
		}
		// Do not average fold means/medians: folds can contain different numbers of valid pairs.
		for (const d of foldImprovements) improvements.push(d);
		overallBefore += before;
		overallAfter += after;
		folds.push({
			fold,
			trainingProducts,
			heldOutProducts: heldOut.length,
			...validationSummary(before, after, foldImprovements)
		});
	}
	return { ...validationSummary(overallBefore, overallAfter, improvements), foldCount, folds };
}
