import type { Catalog } from '#core/dataset/types.ts';

/** Compact published-catalog projection used only for URL/profile migration and saved-item labels. */
export type IdentityCatalog = Pick<Catalog, 'redirects'> & {
	products: Pick<Catalog['products'][number], 'id' | 'brand' | 'model'>[];
	measurements: Pick<Catalog['measurements'][number], 'id' | 'productId'>[];
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
