import type { Catalog, Product, Measurement } from '#core/dataset/types.ts';

/** The data lane's additive catalog contract; remove this adapter after its types land. */
export type IdentityCatalog = {
	products: readonly Pick<Product, 'id' | 'brand' | 'model'>[];
	measurements: readonly Pick<Measurement, 'id' | 'productId'>[];
	redirects?: { products: Record<string, string>; measurements: Record<string, string> };
};

export class CatalogIdentity {
	private readonly products;
	private readonly measurements;
	private readonly redirects;
	constructor(catalog: IdentityCatalog) {
		this.products = new Map(catalog.products.map((product) => [product.id, product]));
		this.measurements = new Map(
			catalog.measurements.map((measurement) => [measurement.id, measurement.productId])
		);
		this.redirects = catalog.redirects;
	}
	productId(id: string): string | undefined {
		const aliases = this.redirects?.products;
		const current = aliases && Object.hasOwn(aliases, id) ? aliases[id] : id;
		return current && this.products.has(current) ? current : undefined;
	}
	measurementId(id: string): string | undefined {
		const aliases = this.redirects?.measurements;
		const current = aliases && Object.hasOwn(aliases, id) ? aliases[id] : id;
		return current && this.measurements.has(current) ? current : undefined;
	}
	measurementProduct(id: string): string | undefined {
		const current = this.measurementId(id);
		return current ? this.measurements.get(current) : undefined;
	}
	name(id: string): string {
		const current = this.productId(id);
		const product = current ? this.products.get(current) : undefined;
		return product ? `${product.brand} ${product.model}` : id;
	}
}

// Structural compatibility with current catalogs and the additive data-lane fields.
export type RedirectCatalog = Catalog & Pick<IdentityCatalog, 'redirects'>;
