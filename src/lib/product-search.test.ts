import { expect, test } from 'vitest';
import { productSearch } from './product-search.ts';

const catalog = [
	{ brand: 'Truthear', model: 'Hexa' },
	{ brand: 'Moondrop', model: 'Chu 2' },
	{ brand: 'Moondrop', model: 'Blessing 3' },
	{ brand: 'Moondrop', model: 'Blessing 3 (foam tips)' }
];
test.each(['truthaer hexa', 'moondrop chu2', 'blessing 3'])('finds catalog tokens with %s', (query) => {
	expect(productSearch(catalog)(query).length).toBeGreaterThan(0);
});
test('retains variants, prioritises exact names, and does not fuzzy-match model numbers', () => {
	expect(productSearch(catalog)('blessing 3')).toEqual(catalog.slice(2));
	expect(productSearch(catalog)('chu 3')).toEqual([]);
	expect(productSearch(catalog)('TRÜTHEAR-hexa')[0]).toEqual(catalog[0]);
});
test('searches ten thousand products without a dependency or a quadratic catalog scan', () => {
	const search = productSearch(
		Array.from({ length: 10_000 }, (_, i) => ({ brand: `Brand ${i}`, model: 'Hexa' }))
	);
	const started = performance.now();
	expect(search('brnad hexa')).toHaveLength(60);
	expect(performance.now() - started).toBeLessThan(500);
});
