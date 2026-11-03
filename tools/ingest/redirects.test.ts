import { describe, expect, it } from 'vitest';
import type { Catalog, Form, Measurement, Product } from '#core/dataset/types.ts';
import { brandKey } from './identity-keys.ts';
import { buildRedirects } from './redirects.ts';

const product = (id: string, model: string, brand = 'Maker', form: Form = 'iem'): Product => ({
	id,
	brand,
	model,
	form,
	measurementIds: []
});
function measurement(
	id: string,
	productId: string,
	file = id,
	kind: Measurement['variant']['kind'] = 'default',
	label = ''
): Measurement {
	return {
		id,
		productId,
		sourceId: 'source',
		partition: 'iem-711',
		variant: { id: `v-${id}`, file, label, kind, isDefault: kind === 'default' },
		channels: ['L'],
		channelContributions: [],
		imbalanceDb: null,
		pairedBins: 0,
		dated: {},
		lastModified: {},
		price: { raw: '', usd: null, sourceId: 'source', crawledAt: '2026-11-03' },
		reviewUrl: null,
		detailFile: 'detail.bin.gz',
		provenance: {
			sourceId: 'source',
			databaseUrl: 'https://source/',
			originalUrls: [`https://source/${file}`],
			processing: [],
			calibrationUrl: null
		},
		warnings: []
	};
}
const catalog = (products: Product[], measurements: Measurement[]): Catalog => ({
	formatVersion: 1,
	form: 'iem',
	products,
	measurements,
	sources: [],
	partitions: []
});
function split(models = ['Alpha', 'Beta'], oldModel = 'Original', extra = true) {
	const previous = catalog(
		[product('old', oldModel)],
		[
			measurement('old-a', 'old', 'a'),
			measurement('old-b', 'old', 'b'),
			...(extra ? [measurement('old-c', 'old', 'c', 'fit', 'tips')] : [])
		]
	);
	const current = catalog(
		[product('a', models[0] ?? ''), product('b', models[1] ?? '')],
		[
			measurement('new-a', 'a', 'a'),
			measurement('new-b', 'b', 'b'),
			...(extra ? [measurement('new-c', 'b', 'c', 'fit', 'tips')] : [])
		]
	);
	return { previous, current };
}

describe('historical redirect disambiguation', () => {
	it('breaks tied former defaults by old-measurement totals, including non-defaults', () => {
		const { previous, current } = split(['Original', 'Beta']);
		const report = buildRedirects([previous], [current]);
		expect(current.redirects?.products.old).toBe('b');
		expect(report.splits).toMatchObject([
			{
				target: 'b',
				reason: 'strict plurality of former measurements',
				targets: [
					{ productId: 'b', formerDefaults: 1, formerMeasurements: 2 },
					{ productId: 'a', formerDefaults: 1, formerMeasurements: 1 }
				]
			}
		]);
	});
	it('keeps a strict former-default plurality ahead of a larger overall count', () => {
		const { previous, current } = split();
		const oldBeta = previous.measurements[1];
		if (!oldBeta) throw new Error('Missing former Beta measurement fixture');
		oldBeta.variant.kind = 'fit';
		const report = buildRedirects([previous], [current]);
		expect(current.redirects?.products.old).toBe('a');
		expect(report.splits).toMatchObject([{ reason: 'strict plurality of former default measurements' }]);
	});
	it('uses totals even when no former measurement was default', () => {
		const { previous, current } = split();
		for (const m of previous.measurements) m.variant.kind = 'fit';
		buildRedirects([previous], [current]);
		expect(current.redirects?.products.old).toBe('b');
	});
	it('breaks an overall tie by identity recomputed with current aliases and plus rules, not the historical ID', () => {
		const { previous, current } = split(['NM2', 'NM2+'], 'NM2+', false);
		const oldProduct = previous.products[0];
		if (!oldProduct) throw new Error('Missing former product fixture');
		oldProduct.brand = 'Maker Acous';
		for (const p of current.products) p.brand = 'Maker Audio';
		buildRedirects([previous], [current], { aliases: { [brandKey('Maker Acous')]: 'Maker Audio' } });
		expect(current.redirects?.products.old).toBe('b');
	});
	it('applies reviewed product aliases when recomputing the old identity', () => {
		const { previous, current } = split(['Reference', 'Revision 2'], 'Revision II', false);
		buildRedirects([previous], [current], { productAliases: { 'maker|revisionii': 'Maker|Revision 2' } });
		expect(current.redirects?.products.old).toBe('b');
	});
	it('never selects an identity-matching candidate outside the former-default leaders', () => {
		const { previous, current } = split(['Alpha', 'Beta'], 'Original', false);
		current.products.push(product('c', 'Original'));
		previous.measurements.push(measurement('old-c', 'old', 'c', 'fit'));
		current.measurements.push(measurement('new-c', 'c', 'c', 'fit'));
		buildRedirects([previous], [current]);
		expect(current.redirects?.products).not.toHaveProperty('old');
	});
	it.each([false, true])(
		'leaves still-tied destinations unmapped (duplicate identities: %s)',
		(sameIdentity) => {
			const { previous, current } = split(
				sameIdentity ? ['Original', 'Original'] : ['Alpha', 'Beta'],
				'Original',
				false
			);
			const report = buildRedirects([previous], [current]);
			expect(current.redirects?.products).not.toHaveProperty('old');
			expect(report.splits).toMatchObject([
				{ target: null, reason: 'unmapped: tied measurements and no unique current identity' }
			]);
		}
	);
	it('resolves a unique product but not an ambiguous measurement when duplicate eligible rows remain', () => {
		const previous = catalog([product('old', 'Original')], [measurement('old-m', 'old', 'raw')]);
		const current = catalog(
			[product('new', 'Original')],
			[measurement('one', 'new', 'raw'), measurement('two', 'new', 'raw')]
		);
		const report = buildRedirects([previous], [current]);
		expect(current.redirects?.products).toEqual({ old: 'new' });
		expect(current.redirects?.measurements).toEqual({});
		expect(report.ambiguousMeasurements).toEqual(['old-m']);
	});
	it('narrows duplicate raw references by unchanged variant kind/label, excluding another product’s fit', () => {
		const previous = catalog([product('old', 'Limited')], [measurement('old-m', 'old', 'raw')]);
		const current = catalog(
			[product('limited', 'Limited'), product('ultra', 'Ultra')],
			[measurement('stock', 'limited', 'raw'), measurement('other', 'ultra', 'raw', 'fit', 'foam tips')]
		);
		const stock = current.measurements[0];
		if (!stock) throw new Error('Missing stock measurement fixture');
		stock.variant.isDefault = false;
		buildRedirects([previous], [current]);
		expect(current.redirects?.products).toEqual({ old: 'limited' });
		expect(current.redirects?.measurements).toEqual({ 'old-m': 'stock' });
	});
	it('counts a former measurement once, not once for each duplicate current row', () => {
		const { previous, current } = split(['Alpha', 'Beta'], 'Original', false);
		current.measurements.push(measurement('duplicate', 'a', 'a'));
		buildRedirects([previous], [current]);
		expect(current.redirects?.products).not.toHaveProperty('old');
	});
	it('preserves raw-file matching when variant metadata changed and no exact variant survives', () => {
		const previous = catalog(
			[product('old', 'Original')],
			[measurement('old-m', 'old', 'raw', 'unknown', 'old label')]
		);
		const current = catalog(
			[product('new', 'Original')],
			[
				measurement('one', 'new', 'raw', 'fit', 'new label'),
				measurement('two', 'new', 'raw', 'tuning', 'another label')
			]
		);
		buildRedirects([previous], [current]);
		expect(current.redirects?.products.old).toBe('new');
		expect(current.redirects?.measurements).toEqual({});
	});
});
