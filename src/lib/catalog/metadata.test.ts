import { expect, test, vi } from 'vitest';
import { readCatalogMetadata } from './metadata.ts';

test('returns only compact identities, redirects and validation projections from the full catalog', async () => {
	const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(
			JSON.stringify({
				products: [{ id: 'p', brand: 'Fixture', model: 'One', measurementIds: ['m'] }],
				measurements: [
					{
						id: 'm',
						productId: 'p',
						partition: 'rig',
						sourceId: 's',
						variant: { label: 'Default', kind: 'default' },
						provenance: { processing: ['large unneeded metadata'] }
					}
				],
				partitions: [{ id: 'rig', statistics: { support: { status: 'sufficient', sources: 3 } } }],
				sources: [{ id: 's', name: 'Fixture Reviewer' }],
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
		expect(compact.measurements).toEqual([
			{
				id: 'm',
				productId: 'p',
				brand: 'Fixture',
				model: 'One',
				partition: 'rig',
				sourceId: 's',
				sourceName: 'Fixture Reviewer',
				variantLabel: 'Default',
				variantKind: 'default'
			}
		]);
		expect(JSON.stringify(compact)).not.toContain('large unneeded metadata');
	} finally {
		fetch.mockRestore();
	}
});

test('cancellation reaches the fetch and never projects a cancelled response', async () => {
	const abort = new AbortController();
	const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((_, options) => {
		expect(options?.signal).toBe(abort.signal);
		abort.abort();
		return Promise.resolve(new Response('{}'));
	});
	try {
		await expect(readCatalogMetadata('https://example.org/catalog.json', abort.signal)).rejects.toThrow(
			'aborted'
		);
		await expect(readCatalogMetadata('https://example.org/catalog.json', abort.signal)).rejects.toThrow(
			'aborted'
		);
		expect(fetch).toHaveBeenCalledOnce();
	} finally {
		fetch.mockRestore();
	}
});
