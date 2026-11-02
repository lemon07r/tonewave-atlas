import type { Source, Form } from '#core/dataset/types.ts';
import type { MeasurementInfo, ProductDetail, ProductListItem, ProductSpread } from '#core/atlas/types.ts';
import { spreadFor } from '#core/atlas/spread.ts';
import { analysis } from '#lib/atlas.ts';
import type { Channel } from '#lib/compare/url.ts';
import { resolve } from '$app/paths';
import { AsyncLru } from '#lib/analysis/cache.ts';
import { CatalogIdentity } from '#lib/catalog/identity.ts';
import { catalogMetadata } from '#lib/catalog/client.ts';
import { needsOtherCatalog, profileNeedsOtherCatalog } from '#lib/catalog/migrate.ts';
import type { Profile } from '#lib/profile/profile.ts';

const identities = new AsyncLru<string, CatalogIdentity>(4);

/** UI lookups must resolve the catalog's ids before relying on engine-returned canonical ids. */
export function catalogIdentity(form: Form, version: string): Promise<CatalogIdentity> {
	const url = `${resolve('/')}data/${version}/catalog-${form}.json.gz`;
	return identities.get(url, async () => new CatalogIdentity((await catalogMetadata(url)).identity));
}

/** Reference diagnostics need catalog metadata, never decoded curve shards. */
export async function productMeasurements(
	form: Form,
	version: string,
	productId: string,
	signal: AbortSignal
): Promise<MeasurementInfo[]> {
	const metadata = await catalogMetadata(`${resolve('/')}data/${version}/catalog-${form}.json.gz`, signal);
	signal.throwIfAborted();
	const canonical = new CatalogIdentity(metadata.identity).productId(productId);
	return metadata.measurements.filter((row) => row.productId === canonical);
}

/** Identity metadata is optional; fetch the other form only for unresolved links or saved items. */
export async function migrationCatalogs(
	form: Form,
	version: string,
	url: URL,
	profile?: Profile
): Promise<Partial<Record<Form, CatalogIdentity>>> {
	const current = await catalogIdentity(form, version).catch(() => undefined);
	if (!current) return {};
	const catalogs: Partial<Record<Form, CatalogIdentity>> = { [form]: current };
	if (needsOtherCatalog(url, current) || (profile && profileNeedsOtherCatalog(profile, form, current))) {
		const other = form === 'iem' ? 'headphone' : 'iem';
		const identity = await catalogIdentity(other, version).catch(() => undefined);
		if (identity) catalogs[other] = identity;
	}
	return catalogs;
}

export function productFor<T extends { id: string }>(
	products: readonly T[],
	id: string,
	identity?: CatalogIdentity
): T | undefined {
	return products.find((product) => product.id === (identity?.productId(id) ?? id));
}

export function dateLabel(value: string): string {
	const date = new Date(value);
	return Number.isNaN(date.valueOf())
		? value.trim() || 'date unknown'
		: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
export function priceListings(
	prices: ProductListItem['prices'],
	sources: readonly Pick<Source, 'id' | 'name'>[],
	now = Date.now()
): string[] {
	return [
		...new Set(
			prices.flatMap((price) => {
				const source = sources.find((s) => s.id === price.sourceId);
				if (price.usd == null || !Number.isFinite(price.usd) || !source) return [];
				const seen = new Date(price.crawledAt).valueOf();
				const date = Number.isFinite(seen) ? dateLabel(price.crawledAt) : 'date unknown';
				const stale = Number.isFinite(seen) && now - seen > 365.25 * 24 * 60 * 60 * 1000;
				return [
					`$${price.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })} reviewer-listed price (${source.name}, seen ${date}; listing date unknown)${stale ? ' · may be out of date' : ''}`
				];
			})
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
