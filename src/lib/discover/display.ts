import { analysis } from '#lib/atlas.ts';
import type { FrSeries } from '#lib/chart.ts';
import type { CandidateInfo, ProductDetail } from '#core/atlas/types.ts';
import { responseDistance } from '#core/analysis/distance.ts';
import { makeWeights } from '#core/analysis/weights.ts';
import { GRID } from '#core/grid.ts';
import { rigLabel } from '#lib/rigs.ts';
import { AsyncLru } from '#lib/analysis/cache.ts';

export interface CurveSource {
	label: string;
	url: string;
}
export interface DisplayCurve {
	series: FrSeries;
	sources: CurveSource[];
}
const details = new WeakMap<ReturnType<typeof analysis>, AsyncLru<string, ProductDetail>>();
export function detail(productId: string): Promise<ProductDetail> {
	const worker = analysis();
	let cache = details.get(worker);
	if (!cache) details.set(worker, (cache = new AsyncLru(8)));
	return cache.get(productId, () =>
		worker.then(async (service) => {
			const result = await service.productDetail(productId);
			if (!result.ok) throw new Error(result.message);
			return result;
		})
	);
}
export function curveSources(product: ProductDetail, ids: readonly string[]): CurveSource[] {
	const unique = new Map<string, CurveSource>();
	for (const { measurement, source } of product.measurements) {
		if (!ids.includes(measurement.id)) continue;
		const url = measurement.provenance.databaseUrl;
		unique.set(url, { label: `${source.name} · ${rigLabel(measurement.partition, [source])}`, url });
	}
	return [...unique.values()];
}

export async function displayCurve(
	productId: string,
	partition: string,
	options: {
		id: string;
		reference?: boolean;
		measurementIds?: string[];
		tuning?: boolean;
		label?: string;
	}
): Promise<DisplayCurve> {
	const product = await detail(productId);
	const spread = product.spread.find((s) => s.partition === partition);
	let ids = spread?.measurementIds ?? [];
	let values = spread?.centre;
	if (options.tuning || options.measurementIds?.length === 1) {
		ids = options.measurementIds ?? [];
		const service = await analysis();
		const curves = await service.curves(ids, { channel: 'avg' });
		const arrays = curves.map((curve) => {
			if (!curve.values || curve.error) throw new Error(curve.error ?? 'Measurement curve unavailable.');
			return curve.values;
		});
		const anchor = arrays[0];
		if (!anchor) throw new Error('No measurement curve available.');
		const weights = makeWeights(GRID);
		const aligned = arrays.map((array) => {
			const d = responseDistance(array, anchor, { frequencies: GRID, weights });
			if (!d) throw new Error('Insufficient overlapping display measurements.');
			return Float64Array.from(array, (v) => v - d.offset);
		});
		values = Float64Array.from(GRID, (_, i) => {
			const finite = aligned.map((array) => array[i] ?? NaN).filter(Number.isFinite);
			return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : NaN;
		});
	}
	if (!values) throw new Error('No default consensus curve on this rig.');
	const sources = curveSources(product, ids);
	return {
		series: {
			id: options.id,
			label: options.label ?? `${product.product.brand} ${product.product.model}`,
			values,
			...(options.reference ? { reference: true } : {}),
			attribution: `${partition} · ${sources.map((s) => `${s.label}: ${s.url}`).join('; ')}`
		},
		sources
	};
}

export function candidateCurve(candidate: CandidateInfo, partition: string): Promise<DisplayCurve> {
	return displayCurve(candidate.product.id, partition, {
		id: candidate.id,
		label: `${candidate.product.brand} ${candidate.product.model}${candidate.variantLabel ? ` · ${candidate.variantLabel}` : ''}`,
		...(candidate.kind === 'tuning' ? { tuning: true, measurementIds: candidate.measurementIds } : {})
	});
}
