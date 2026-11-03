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
	it('applies reviewed product aliases to stock display names without crossing forms or guessing ambiguity', () => {
		const stock = product('stock', 'Aria II', 'MOONDROP');
		const modified = product('modified', 'Aria 2 Mod', 'Moondrop Audio');
		markModifiedProducts([stock, modified], {}, { 'moondrop|ariaii': 'MOONDROP|Aria 2' });
		expect(modified.baseProductId).toBe(stock.id);
		const ambiguous = product('ambiguous', 'Aria 2 Mod', 'MOONDROP');
		markModifiedProducts(
			[stock, product('duplicate', 'Aria 2', 'MOONDROP'), ambiguous],
			{},
			{ 'moondrop|ariaii': 'MOONDROP|Aria 2' }
		);
		expect(ambiguous).not.toHaveProperty('baseProductId');
		const cross = product('cross', 'Aria 2 Mod', 'MOONDROP', 'headphone');
		markModifiedProducts([stock, cross], {}, { 'moondrop|ariaii': 'MOONDROP|Aria 2' });
		expect(cross).not.toHaveProperty('baseProductId');
	});
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
	it.each([
		['Susvara', 'Susvara [Bass Mod]'],
		['HE500', 'HE500 [Bass Mod]'],
		['P2-Pro', 'P2-Pro [Mod]'],
		['ASTERIA', 'ASTERIA (PROTOTYPE)'],
		['Studio SA4', 'Studio SA4 (Prototype)'],
		['TH900', 'TH900 (Eudis Mod)'],
		['HE400se [Stealth 2024]', 'HE400se [Stealth 2024] [Bass Mod]'],
		['Reference', 'Reference (production proto)']
	])('links the complete trailing mod segment in %s / %s', (stockModel, modifiedModel) => {
		const stock = product('stock', stockModel),
			modified = product('modified', modifiedModel);
		const before = structuredClone(modified);
		markModifiedProducts([stock, modified]);
		expect(modified).toEqual({ ...before, modified: true, baseProductId: stock.id });
	});
	it.each([
		['CHU', 'CHU BASS MOD'],
		['Reference', 'Reference Bass Boost modded'],
		['Reference', 'Reference Production prototype'],
		['Model', 'Model Cotton Mod']
	])('links a one/two-word trailing qualifier in %s / %s', (stockModel, modifiedModel) => {
		const stock = product('stock', stockModel),
			modified = product('modified', modifiedModel);
		markModifiedProducts([stock, modified]);
		expect(modified).toMatchObject({ modified: true, baseProductId: stock.id });
	});
	it('leaves an ambiguous pair of one-word and two-word phrase bases unlinked', () => {
		const products = [
			product('short', 'Reference'),
			product('long', 'Reference Alpha'),
			product('modified', 'Reference Alpha Beta Mod')
		];
		const report = markModifiedProducts(products);
		expect(products.at(-1)).toMatchObject({ modified: true });
		expect(products.at(-1)).not.toHaveProperty('baseProductId');
		expect(report.baseLinks).toBe(0);
	});
	it('never removes the II revision from QUIET SEA II PROTOTYPE', () => {
		const original = product('original', 'QuietSea');
		const prototype = product('prototype', 'QUIET SEA II PROTOTYPE');
		markModifiedProducts([original, prototype]);
		expect(prototype).toMatchObject({ modified: true });
		expect(prototype).not.toHaveProperty('baseProductId');
		const revision = product('revision', 'Quiet Sea II');
		markModifiedProducts([original, revision, prototype]);
		expect(prototype.baseProductId).toBe(revision.id);
	});
	it.each([
		'II',
		'III',
		'IV',
		'V',
		'VI',
		'VII',
		'VIII',
		'IX',
		'X',
		'2x',
		'PR2',
		'2024',
		'V2',
		'A',
		'z',
		'Pro',
		'Plus',
		'Max',
		'Mini',
		'Lite',
		'SE',
		'MK',
		'Mark',
		'Gen',
		'Edition'
	])('stops qualifier stripping at the protected token %s', (token) => {
		const stock = product('stock', 'Reference');
		const modified = product('modified', `Reference ${token} Mod`);
		markModifiedProducts([stock, modified]);
		expect(modified).toMatchObject({ modified: true });
		expect(modified).not.toHaveProperty('baseProductId');
		// A protected token farther left allows only the shorter, exact stock match.
		const shorter = product('shorter', `Reference ${token}`);
		const qualified = product('qualified', `Reference ${token} Bass Mod`);
		markModifiedProducts([stock, shorter, qualified]);
		expect(qualified.baseProductId).toBe(shorter.id);
		const missingShorter = product('missing-shorter', `Reference ${token} Bass Mod`);
		markModifiedProducts([stock, missingShorter]);
		expect(missingShorter).not.toHaveProperty('baseProductId');
	});
	it('retains CHU BASS MOD linking after guarding revision tokens', () => {
		const stock = product('stock', 'Chu');
		const modified = product('modified', 'CHU BASS MOD');
		markModifiedProducts([stock, modified]);
		expect(modified.baseProductId).toBe(stock.id);
	});
	it('preserves the existing resolver priority instead of replacing accepted links', () => {
		const products = [
			product('stock', 'Susvara'),
			product('existing-base', 'Susvara Bass'),
			product('modified', 'Susvara [Bass Mod]')
		];
		markModifiedProducts(products);
		expect(products.at(-1)?.baseProductId).toBe('existing-base');
	});
	it('rejects a stripped base that still contains a modification word, even if its compact key matches stock', () => {
		const products = [product('compact', 'ReferenceMod'), product('modified', 'Reference Mod [Bass Mod]')];
		markModifiedProducts(products);
		expect(products.at(-1)).toMatchObject({ modified: true });
		expect(products.at(-1)).not.toHaveProperty('baseProductId');
	});
	it('omits ambiguous, missing, modified or cross-form bases without stripping real qualifiers', () => {
		const cases = [
			[product('a', 'Model', 'Maker Audio'), product('b', 'Model'), product('ambiguous', 'Model Mod')],
			[product('iem', 'Model'), product('cross-form', 'Model Mod', 'Maker', 'headphone')],
			[product('stock', 'Model'), product('revision', 'Model Mod V2')],
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
