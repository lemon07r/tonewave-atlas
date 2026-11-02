import { decompressGzip } from '#core/dataset/codec.ts';
import type { IdentityCatalog, RedirectCatalog } from './identity.ts';
import { validationFigures, type ValidationFigure } from '#lib/method/figures.ts';

export interface CatalogMetadata {
	identity: IdentityCatalog;
	validation: ValidationFigure[];
}

/** Runs in the metadata worker. Never transfer the full catalog back to the main thread. */
export async function readCatalogMetadata(url: string): Promise<CatalogMetadata> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Catalog metadata request failed (${response.status}).`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	const decoded = bytes[0] === 0x1f && bytes[1] === 0x8b ? await decompressGzip(bytes) : bytes;
	const catalog = JSON.parse(new TextDecoder().decode(decoded)) as RedirectCatalog;
	return {
		identity: {
			products: catalog.products.map(({ id, brand, model }) => ({ id, brand, model })),
			measurements: catalog.measurements.map(({ id, productId }) => ({ id, productId })),
			...(catalog.redirects ? { redirects: catalog.redirects } : {})
		},
		validation: validationFigures(catalog)
	};
}
