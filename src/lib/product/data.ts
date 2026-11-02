import type { Source } from '#core/dataset/types.ts';
import type { ProductDetail, ProductListItem, ProductSpread } from '#core/atlas/types.ts';
import { spreadFor } from '#core/atlas/spread.ts';
import { analysis } from '#lib/atlas.ts';
import type { Channel } from '#lib/compare/url.ts';

export function dateLabel(value: string): string {
	const date = new Date(value);
	return Number.isNaN(date.valueOf())
		? value
		: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
export function priceListings(
	prices: ProductListItem['prices'],
	sources: readonly Pick<Source, 'id' | 'name'>[]
): string[] {
	return [
		...new Set(
			prices.flatMap((price) =>
				price.usd != null && Number.isFinite(price.usd)
					? [
							`$${price.usd.toLocaleString('en-US')} listed by ${sources.find((s) => s.id === price.sourceId)?.name ?? price.sourceId}, ${dateLabel(price.crawledAt)}`
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
	return spreadFor(
		curves.flatMap((curve, i) => {
			const row = rows[i];
			return curve.values && row ? [{ measurement: row.measurement, values: curve.values }] : [];
		}),
		partition
	);
}
