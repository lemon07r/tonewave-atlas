import { expect, test } from 'vitest';
import type { ProductListItem } from '#core/atlas/types.ts';
import { priceListings } from './data.ts';

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
