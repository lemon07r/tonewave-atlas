import { expect, test, vi } from 'vitest';
import type { ProductListItem } from '#core/atlas/types.ts';
import { catalogIdentity, migrationCatalogs, priceListings, productFor } from './data.ts';
import { gzipSync } from 'node:zlib';

vi.mock('#lib/catalog/client.ts', async () => ({
	catalogMetadata: (await import('#lib/catalog/metadata.ts')).readCatalogMetadata
}));

test('loads redirects from both gzip and decoded catalogs and retries failed requests', async () => {
	const fixture = {
		partitions: [],
		products: [{ id: 'now', brand: 'Fixture', model: 'One' }],
		measurements: [
			{
				id: 'm-now',
				productId: 'now',
				sourceId: 's',
				partition: 'rig',
				variant: { label: 'Default', kind: 'default' }
			}
		],
		sources: [{ id: 's', name: 'Fixture Reviewer' }],
		redirects: { products: { old: 'now' }, measurements: { 'm-old': 'm-now' } }
	};
	const fetch = vi.spyOn(globalThis, 'fetch');
	try {
		for (const [version, body] of [
			['fixture-json', JSON.stringify(fixture)],
			['fixture-gzip', gzipSync(JSON.stringify(fixture))]
		] as const) {
			fetch.mockResolvedValueOnce(new Response(body));
			const identity = await catalogIdentity('iem', version);
			expect(identity.measurementId('m-old')).toBe('m-now');
			expect(productFor(fixture.products, 'old', identity)).toEqual(fixture.products[0]);
		}
		fetch.mockResolvedValueOnce(new Response('', { status: 503 }));
		await expect(catalogIdentity('headphone', 'fixture-retry')).rejects.toThrow('503');
		fetch.mockResolvedValueOnce(new Response(JSON.stringify(fixture)));
		expect((await catalogIdentity('headphone', 'fixture-retry')).productId('old')).toBe('now');
	} finally {
		fetch.mockRestore();
	}
});

test('migration lookup fetches the other form only for unresolved identities and keeps failures optional', async () => {
	const fixture = {
		partitions: [],
		products: [{ id: 'iem', brand: 'Fixture', model: 'IEM' }],
		sources: [],
		measurements: []
	};
	const fetch = vi.spyOn(globalThis, 'fetch');
	try {
		fetch.mockResolvedValueOnce(new Response(JSON.stringify(fixture)));
		const current = await migrationCatalogs('iem', 'cross-form', new URL('https://example.org/?ref=iem'));
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(current.iem?.productId('iem')).toBe('iem');
		fetch.mockResolvedValueOnce(new Response('', { status: 503 }));
		const failed = await migrationCatalogs(
			'iem',
			'cross-form',
			new URL('https://example.org/?ref=headphone')
		);
		expect(failed.iem).toBe(current.iem);
		expect(failed.headphone).toBeUndefined();
		fetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ ...fixture, products: [{ id: 'headphone', brand: 'Fixture', model: 'Headphone' }] })
			)
		);
		const retry = await migrationCatalogs('iem', 'cross-form', new URL('https://example.org/?ref=headphone'));
		expect(retry.headphone?.productId('headphone')).toBe('headphone');
		expect(fetch).toHaveBeenCalledTimes(3);
	} finally {
		fetch.mockRestore();
	}
});

test('lists each service price with its summary source name and crawl month', () => {
	const prices: ProductListItem['prices'] = [
		{ raw: '$79', usd: 79, sourceId: 'a', crawledAt: '2026-03-01T00:00:00Z' },
		{ raw: '$79', usd: 79, sourceId: 'b', crawledAt: '2026-04-01T00:00:00Z' },
		{ raw: '$1,099', usd: 1099, sourceId: 'a', crawledAt: '2026-05-01T00:00:00Z' }
	];
	expect(
		priceListings(prices, [
			{ id: 'a', name: 'Reviewer A' },
			{ id: 'b', name: 'Reviewer B' }
		])
	).toEqual([
		'$79 reviewer-listed price (Reviewer A, seen Mar 2026; listing date unknown)',
		'$79 reviewer-listed price (Reviewer B, seen Apr 2026; listing date unknown)',
		'$1,099 reviewer-listed price (Reviewer A, seen May 2026; listing date unknown)'
	]);
});

test('omits non-USD prices and unattributed listings when a summary source is absent', () => {
	expect(
		priceListings(
			[
				{ raw: '€80', usd: null, sourceId: 'a', crawledAt: '2026-03-01' },
				{ raw: '$20', usd: 20, sourceId: 'missing', crawledAt: '2026-03-01' }
			],
			[]
		)
	).toEqual([]);
});

test('has no price listing when the product has no service prices', () => {
	expect(priceListings([], [])).toEqual([]);
});

test('rejects non-finite USD but preserves raw crawl-date evidence', () => {
	expect(
		priceListings(
			[NaN, Infinity, -Infinity, 30].map((usd) => ({
				raw: '$30',
				usd,
				sourceId: 's',
				crawledAt: 'unknown date'
			})),
			[{ id: 's', name: 'Source' }]
		)
	).toEqual(['$30 reviewer-listed price (Source, seen date unknown; listing date unknown)']);
});

test('warns when the price was seen more than twelve months ago, never calling that the listing date', () => {
	const sources = [{ id: 's', name: 'Reviewer' }];
	const prices = [{ raw: '$20', usd: 20, sourceId: 's', crawledAt: '2025-10-01' }];
	expect(priceListings(prices, sources, Date.parse('2026-11-02'))).toEqual([
		'$20 reviewer-listed price (Reviewer, seen Oct 2025; listing date unknown) · may be out of date'
	]);
	expect(priceListings(prices, sources, Date.parse('2026-09-30'))[0]).not.toContain('out of date');
});
