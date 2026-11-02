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
		'$79 listed by Reviewer A, Mar 2026',
		'$79 listed by Reviewer B, Apr 2026',
		'$1,099 listed by Reviewer A, May 2026'
	]);
});

test('omits non-USD prices and retains source IDs when a summary source is absent', () => {
	expect(
		priceListings(
			[
				{ raw: '€80', usd: null, sourceId: 'a', crawledAt: '2026-03-01' },
				{ raw: '$20', usd: 20, sourceId: 'missing', crawledAt: '2026-03-01' }
			],
			[]
		)
	).toEqual(['$20 listed by missing, Mar 2026']);
});

test('has no price listing when the product has no service prices', () => {
	expect(priceListings([], [])).toEqual([]);
});
