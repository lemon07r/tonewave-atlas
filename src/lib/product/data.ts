import { resolve } from '$app/paths';
import type { Catalog, Form, Measurement, Source } from '#core/dataset/types.ts';
import type { ProductDetail, ProductSpread } from '#core/atlas/types.ts';
import { consensus } from '#core/atlas/index.ts';
import { GRID } from '#core/grid.ts';
import { analysis } from '#lib/atlas.ts';
import type { Channel } from '#lib/compare/url.ts';

const catalogs = new Map<Form, Promise<Catalog>>();
/** Metadata only: the worker API intentionally returns a compact product search list. */
export function catalog(form: Form): Promise<Catalog> {
	let pending = catalogs.get(form);
	if (!pending) {
		pending = analysis().then(async (service) => {
			const summary = await service.summary();
			const response = await fetch(`${resolve('/')}data/${summary.version}/catalog-${form}.json.gz`);
			if (!response.ok || !response.body) throw new Error(`Could not load catalog (${response.status}).`);
			return new Response(
				response.body.pipeThrough(new DecompressionStream('gzip'))
			).json() as Promise<Catalog>;
		});
		catalogs.set(form, pending);
		void pending.catch(() => catalogs.delete(form));
	}
	return pending;
}
export function rigLabel(partition: string): string {
	if (partition === 'iem-711') return '711-family';
	if (partition.includes('5128')) return 'B&K 5128';
	if (partition.includes('4128')) return 'B&K 4128';
	if (partition.includes('ears-pro')) return 'miniDSP EARS Pro';
	if (partition.includes('ears')) return 'miniDSP EARS';
	return partition.replace(/^headphone-source-/, 'Headphone rig · ');
}
export function dateLabel(value: string): string {
	const date = new Date(value);
	return Number.isNaN(date.valueOf())
		? value
		: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
export function priceListings(measurements: Measurement[], sources: Source[]): string[] {
	return [
		...new Set(
			measurements.flatMap((m) =>
				m.price?.usd != null
					? [
							`$${m.price.usd.toLocaleString('en-US')} listed by ${sources.find((s) => s.id === m.price?.sourceId)?.name ?? m.price.sourceId}, ${dateLabel(m.price.crawledAt)}`
						]
					: []
			)
		)
	];
}
export function mainPartition(detail: ProductDetail): string {
	return (
		[...detail.spread].sort(
			(a, b) => b.measurementIds.length - a.measurementIds.length || a.partition.localeCompare(b.partition)
		)[0]?.partition ??
		detail.measurements[0]?.measurement.partition ??
		''
	);
}
/** Channel views use the same aligned default median as the service's average-channel detail. */
export async function channelSpread(
	detail: ProductDetail,
	partition: string,
	channel: Channel
): Promise<ProductSpread | null> {
	if (channel === 'avg') return detail.spread.find((s) => s.partition === partition) ?? null;
	const rows = detail.measurements.filter(
		(row) => row.measurement.partition === partition && row.measurement.variant.kind === 'default'
	);
	const curves = await (
		await analysis()
	).curves(
		rows.map((row) => row.measurement.id),
		{ channel }
	);
	const pooled = consensus(
		curves.flatMap((curve, i) => {
			const row = rows[i];
			return curve.values && row ? [{ measurement: row.measurement, values: curve.values }] : [];
		}),
		GRID
	);
	if (!pooled) return null;
	const min = new Float64Array(GRID.length).fill(NaN),
		max = min.slice(),
		support = new Uint16Array(GRID.length);
	for (let i = 0; i < GRID.length; i++) {
		const values = pooled.aligned.map((row) => row.values[i] ?? NaN).filter(Number.isFinite);
		support[i] = values.length;
		if (values.length) {
			min[i] = Math.min(...values);
			max[i] = Math.max(...values);
		}
	}
	return {
		partition,
		centre: pooled.values,
		min,
		max,
		support,
		sourceCount: new Set(pooled.aligned.map((row) => row.measurement.sourceId)).size,
		measurementIds: pooled.aligned.map((row) => row.measurement.id)
	};
}
