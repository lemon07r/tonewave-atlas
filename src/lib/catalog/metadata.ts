import { decompressGzip } from '#core/dataset/codec.ts';
import type { IdentityCatalog } from './identity.ts';
import type { Catalog } from '#core/dataset/types.ts';
import type { MeasurementInfo } from '#core/atlas/types.ts';
import { validationFigures, type ValidationFigure } from '#lib/method/figures.ts';

export interface CatalogMetadata {
	identity: IdentityCatalog;
	validation: ValidationFigure[];
	measurements: MeasurementInfo[];
}

/** Runs in the metadata worker. Never transfer the full catalog back to the main thread. */
export async function readCatalogMetadata(url: string, signal?: AbortSignal): Promise<CatalogMetadata> {
	signal?.throwIfAborted();
	const response = await fetch(url, { ...(signal ? { signal } : {}) });
	if (!response.ok) throw new Error(`Catalog metadata request failed (${response.status}).`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	signal?.throwIfAborted();
	const decoded = bytes[0] === 0x1f && bytes[1] === 0x8b ? await decompressGzip(bytes) : bytes;
	signal?.throwIfAborted();
	const catalog = JSON.parse(new TextDecoder().decode(decoded)) as Catalog;
	const products = new Map(catalog.products.map((product) => [product.id, product]));
	const sources = new Map(catalog.sources.map((source) => [source.id, source]));
	return {
		identity: {
			products: catalog.products.map(({ id, brand, model }) => ({ id, brand, model })),
			measurements: catalog.measurements.map(({ id, productId }) => ({ id, productId })),
			...(catalog.redirects ? { redirects: catalog.redirects } : {})
		},
		validation: validationFigures(catalog),
		measurements: catalog.measurements.flatMap((measurement): MeasurementInfo[] => {
			const product = products.get(measurement.productId);
			if (!product) return [];
			return [
				{
					id: measurement.id,
					productId: product.id,
					brand: product.brand,
					model: product.model,
					partition: measurement.partition,
					sourceId: measurement.sourceId,
					sourceName: sources.get(measurement.sourceId)?.name ?? measurement.sourceId,
					variantLabel: measurement.variant.label,
					variantKind: measurement.variant.kind
				}
			];
		})
	};
}
