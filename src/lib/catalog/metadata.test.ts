import { expect, test, vi } from 'vitest';
import { readCatalogMetadata } from './metadata.ts';

test('returns only compact identities, redirects and validation projections from the full catalog', async () => {
	const fetch = vi
		.spyOn(globalThis, 'fetch')
		.mockResolvedValue(
			new Response(
				JSON.stringify({
					products: [{ id: 'p', brand: 'Fixture', model: 'One', measurementIds: ['m'] }],
					measurements: [
						{ id: 'm', productId: 'p', provenance: { processing: ['large unneeded metadata'] } }
					],
					partitions: [{ id: 'rig', statistics: { support: { status: 'sufficient', sources: 3 } } }],
					sources: [{ id: 's' }],
					redirects: { products: { old: 'p' }, measurements: {} }
				})
			)
		);
	try {
		const compact = await readCatalogMetadata('https://example.org/catalog.json');
		expect(compact.identity).toEqual({
			products: [{ id: 'p', brand: 'Fixture', model: 'One' }],
			measurements: [{ id: 'm', productId: 'p' }],
			redirects: { products: { old: 'p' }, measurements: {} }
		});
		expect(compact.validation[0]).toMatchObject({ id: 'rig', sources: 3 });
		expect(JSON.stringify(compact)).not.toContain('large unneeded metadata');
	} finally {
		fetch.mockRestore();
	}
});
