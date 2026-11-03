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

test('nonblank unsupported text is not treated as an empty query', () => {
	for (const query of ['ø', '耳机', '---']) expect(productSearch(catalog)(query)).toEqual([]);
	expect(productSearch(catalog)('  ')).toEqual(catalog);
});

test('numeric model tokens require exact matches even for long or joined model numbers', () => {
	const search = productSearch([
		{ brand: 'Final', model: 'E5000' },
		{ brand: 'Final', model: 'E4000' },
		{ brand: 'Moondrop', model: 'Chu 20' }
	]);
	expect(search('e6000')).toEqual([]);
	expect(search('Chu 2')).toEqual([]);
	expect(search('e5000')).toEqual([{ brand: 'Final', model: 'E5000' }]);
});

test('honors every pasted search term instead of truncating after twelve', () => {
	const prefix = Array.from({ length: 12 }, () => 'hexa').join(' ');
	expect(productSearch(catalog)(`${prefix} impossible`)).toEqual([]);
	expect(productSearch(catalog)(`${prefix} truthear`)).toEqual([catalog[0]]);
});
