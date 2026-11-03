import { describe, expect, it } from 'vitest';
import type { Product } from '#core/dataset/types.ts';
import { markModifiedProducts } from './product-flags.ts';

const product = (id: string, model: string, brand = 'Maker', form: Product['form'] = 'iem'): Product => ({
	id,
	brand,
	model,
	form,
	measurementIds: [`m-${id}`]
});

describe('modified product metadata', () => {
	it.each(['mod', 'MoDdEd', 'MODIFIED', 'PROTOTYPE', 'proto', 'Foam Mod', 'foam-mod', 'Mod Foam'])(
		'flags a standalone %s and links its unchanged identity to stock',
		(descriptor) => {
			const stock = product('stock', 'Reference'),
				modified = product('modified', `Reference ${descriptor}`);
			const before = structuredClone(modified);
			const report = markModifiedProducts([stock, modified]);
			expect(modified).toEqual({ ...before, modified: true, baseProductId: stock.id });
			expect(stock).not.toHaveProperty('modified');
			expect(report).toEqual({
				modified: 1,
				baseLinks: 1,
				rules: { a: 0, b: 1, c: 0 },
				wordMatches: [
					{
						id: modified.id,
						brand: modified.brand,
						model: modified.model,
						form: modified.form,
						baseProductId: stock.id
					}
				]
			});
		}
	);
	it('links the complete CanJam prototype marker and nested-bracket markers to stock', () => {
		const stock = product('stock', 'Reference', 'CrinEar');
		const prototype = product(
			'canjam',
			'Reference [modified: (version: CanJam NYC 2025 prototype)]',
			'CrinEar'
		);
		const nested = product('nested', 'Reference [modified: DIY [mesh]]', 'CrinEar');
		const report = markModifiedProducts([prototype, nested, stock]);
		expect(prototype).toMatchObject({ modified: true, baseProductId: stock.id });
		expect(nested).toMatchObject({ modified: true, baseProductId: stock.id });
		expect(report.rules).toEqual({ a: 2, b: 2, c: 0 });
	});
	it('flags source-local Custom collections but not Custom Art or partial-word names', () => {
		const custom = product('custom', 'Handbuilt', 'Custom (reviewer)');
		const negatives = [
			product('art', 'FIBAE 7', 'Custom Art'),
			product('modena', 'Modena'),
			product('model', 'Model X'),
			product('mods', 'Model mods'),
			product('maker', 'Tungsten', 'Mod House')
		];
		const before = structuredClone(negatives);
		expect(markModifiedProducts([custom, ...negatives])).toEqual({
			modified: 1,
			baseLinks: 0,
			rules: { a: 0, b: 0, c: 1 },
			wordMatches: []
		});
		expect(custom).toMatchObject({ modified: true });
		expect(custom).not.toHaveProperty('baseProductId');
		expect(negatives).toEqual(before);
	});
	it('uses brand aliases, plus-sign and CJK model keys for same-form stock lookup', () => {
		const stock = product('plus', 'NA2 Plus', 'NF Audio');
		const plain = product('plain', 'NA2', 'NF');
		const modified = product('modified', 'NA2+ (青龙) Mod', 'NF ACOUS');
		markModifiedProducts([modified, plain, stock], { nfacous: 'NF Audio' });
		expect(modified.baseProductId).toBe(stock.id);
	});
	it('omits ambiguous, missing, modified or cross-form bases without stripping real qualifiers', () => {
		const cases = [
			[product('a', 'Model', 'Maker Audio'), product('b', 'Model'), product('ambiguous', 'Model Mod')],
			[product('iem', 'Model'), product('cross-form', 'Model Mod', 'Maker', 'headphone')],
			[product('stock', 'Model'), product('revision', 'Model Mod V2')],
			[product('stock', 'Model'), product('cotton', 'Model Cotton Mod')],
			[product('modified-base', 'Model Mod'), product('nested-mod', 'Model Mod [modified: pads]')],
			[product('stock', 'Model'), product('nonterminal', 'Model [modified: pads] SE [label]')],
			[product('empty', 'Mod')]
		];
		for (const products of cases) {
			markModifiedProducts(products);
			expect(products.at(-1)).toMatchObject({ modified: true });
			expect(products.at(-1)).not.toHaveProperty('baseProductId');
		}
	});
	it('reports every overlapping word match deterministically, without modifying ids or membership', () => {
		const products = [
			product('z', 'Model prototype'),
			product('a', 'Reference [modified: foam]', 'Custom (reviewer)')
		];
		const before = products.map(({ id, measurementIds }) => ({ id, measurementIds: [...measurementIds] }));
		const report = markModifiedProducts(products);
		expect(report).toMatchObject({ modified: 2, baseLinks: 0, rules: { a: 1, b: 2, c: 1 } });
		expect(report.wordMatches.map((p) => p.id)).toEqual(['a', 'z']);
		expect(products.map(({ id, measurementIds }) => ({ id, measurementIds }))).toEqual(before);
		expect(markModifiedProducts([...products].reverse())).toEqual(report);
	});
});
