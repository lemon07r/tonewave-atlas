import { describe, expect, it } from 'vitest';
import type { Catalog, Form, Measurement, Product } from '#core/dataset/types.ts';
import { finaliseDefaults } from './default-coverage.ts';
import { modification } from './quality.ts';
import { buildRedirects } from './redirects.ts';
import { mergeSampleIdentities, sampleIdentity } from './samples.ts';
import { identity } from './transform.ts';

function fixture(models: string[], form: Form = 'iem') {
	const products = new Map<string, Product>();
	const rows = models.map((model, i) => {
		const product = identity('Maker', model, form, {});
		const id = `m-${i}`;
		products.set(product.id, { ...product, form, measurementIds: [id] });
		const measurement: Measurement = {
			id,
			productId: product.id,
			sourceId: 'source',
			partition: `${form}-5128`,
			variant: {
				id: `v-${i}`,
				file: `Maker ${model} (standard bore tips)`,
				label: '',
				kind: 'default',
				isDefault: true
			},
			channels: ['L'],
			channelContributions: [],
			imbalanceDb: null,
			pairedBins: 0,
			dated: {},
			lastModified: {},
			price: null,
			reviewUrl: null,
			detailFile: '',
			warnings: [],
			provenance: {
				sourceId: 'source',
				databaseUrl: 'https://fixture.invalid/',
				originalUrls: [`https://fixture.invalid/${i}`],
				calibrationUrl: null,
				processing: []
			}
		};
		return { measurement, sourceOrder: i };
	});
	return { products, rows };
}

describe('sample/unit product identities', () => {
	it.each([
		['Reference (sample 2)', 'Reference'],
		['Horizon (sample 02)', 'Horizon'],
		['Dioko Sample 3', 'Dioko'],
		['EW200 Unit 2', 'EW200'],
		['Kato (S1)', 'Kato'],
		['DTE500 (S12)', 'DTE500'],
		['Singularity Sample1', 'Singularity'],
		['CRA Sample 2 Modded', 'CRA Modded'],
		['STORM [modified: (Sample 3) (Tamtrum Mod)]', 'STORM [modified: (Tamtrum Mod)]']
	])('strips only a declared unit marker from %s', (model, parent) => {
		expect(sampleIdentity(model)?.parent).toBe(parent);
	});
	it.each([
		'S8',
		'S12',
		'EA500 S',
		'Volume S',
		'Pi7 S2',
		'Px7 S3',
		'Px8 S2',
		'HE6se V2',
		'Model S2',
		'Model Sample 3L + 4R',
		'Model Sample 2 Silver ATOM',
		'Model (sample 02 golden)',
		'Sample 1',
		'sample 3',
		'Unit 2',
		'Sampler 2'
	])('does not invent a base for real model tokens or ambiguous descriptors: %s', (model) => {
		expect(sampleIdentity(model)).toBeNull();
	});
	it.each(['iem', 'headphone'] as const)(
		'keeps the existing %s default, files, IDs, fit text and redirect history',
		(form) => {
			const { products, rows } = fixture(['Reference', 'Reference (sample 2)'], form);
			const catalog = (): Catalog => ({
				formatVersion: 1,
				form,
				products: [...products.values()],
				measurements: rows.map((r) => r.measurement),
				sources: [],
				partitions: []
			});
			const previous = structuredClone(catalog());
			const retired = previous.products[1];
			const sample = rows[1]?.measurement;
			if (!retired || !sample) throw new Error('Missing sample fixture');
			previous.redirects = { products: { ancient: retired.id }, measurements: { older: sample.id } };
			const files = rows.map((r) =>
				structuredClone({
					id: r.measurement.id,
					urls: r.measurement.provenance.originalUrls,
					file: r.measurement.variant.file
				})
			);
			const result = mergeSampleIdentities(products, rows);
			finaliseDefaults(products, rows, []);
			expect(result.moves).toHaveLength(1);
			expect(products.size).toBe(1);
			expect(rows.map((r) => r.measurement.variant.kind)).toEqual(['default', 'unit']);
			expect(sample.variant.label).toContain('sample 2');
			expect(sample.variant.label).toContain('standard bore tips');
			expect(sample.provenance.processing).toContainEqual(
				expect.stringContaining('recognized sample/unit identity')
			);
			expect(
				rows.map((r) => ({
					id: r.measurement.id,
					urls: r.measurement.provenance.originalUrls,
					file: r.measurement.variant.file
				}))
			).toEqual(files);
			const current = catalog();
			const redirects = buildRedirects([previous], [current]);
			expect(redirects).toMatchObject({ products: 1, measurements: 0 });
			expect(current.redirects?.products).toEqual({
				ancient: sample.productId,
				[retired.id]: sample.productId
			});
			expect(current.redirects?.measurements).toEqual({ older: sample.id });
		}
	);
	it('creates one base for sample-only sources and selects the lowest sample, not the S8 model number', () => {
		const { products, rows } = fixture(['S8 Sample 12', 'S8 Sample 2', 'S8 (S3)']);
		const merged = mergeSampleIdentities(products, rows);
		expect(merged.created).toHaveLength(1);
		expect([...products.values()].map((p) => p.model)).toEqual(['S8']);
		expect(rows.every((r) => r.measurement.variant.kind === 'unit')).toBe(true);
		finaliseDefaults(products, rows, []);
		expect(rows.map((r) => r.measurement.variant.isDefault)).toEqual([false, true, false]);
		expect(rows[1]?.measurement.provenance.processing).toContain(
			'default coverage: deterministic coverage fallback; previous kind unit; original label retained'
		);
	});
	it('gives a sample-only source coverage even when another source supplies a selected switch state', () => {
		const { products, rows } = fixture(['Model', 'Model Sample 3', 'Model Sample 2']);
		const base = rows[0]?.measurement;
		if (!base) throw new Error('Missing base fixture');
		base.sourceId = 'canonical';
		base.variant.file = 'Model DD';
		mergeSampleIdentities(products, rows);
		const result = finaliseDefaults(products, rows, [
			{ productId: base.productId, preferred: 'switch:du:dd' }
		]);
		expect(result.exceptions).toEqual([]);
		expect(rows.map((r) => r.measurement.variant.isDefault)).toEqual([true, false, true]);
	});
	it('selects defaults separately in each final partition', () => {
		const { products, rows } = fixture(['Model', 'Model Sample 2']);
		const sample = rows[1]?.measurement;
		if (!sample) throw new Error('Missing sample fixture');
		sample.partition = 'iem-711';
		mergeSampleIdentities(products, rows);
		finaliseDefaults(products, rows, []);
		expect(rows.every((r) => r.measurement.variant.isDefault)).toBe(true);
	});
	it('keeps file-level modifications separate from stock while removing the sample marker', () => {
		const modified = modification(
			{
				brand: 'Maker',
				name: 'Model',
				file: ['Model'],
				suffix: ['Sample 1 Mod (foam)'],
				price: null,
				reviewLink: null
			},
			0
		);
		const { products, rows } = fixture(['Model', modified.name, 'Model Sample 2 Modded', 'Model Modded']);
		mergeSampleIdentities(products, rows);
		finaliseDefaults(products, rows, []);
		expect([...products.values()].map((p) => p.model).sort()).toEqual([
			'Model',
			'Model Modded',
			'Model [modified: Mod (foam)]'
		]);
		expect(rows[0]?.measurement.productId).not.toBe(rows[1]?.measurement.productId);
		expect(rows[2]?.measurement.productId).toBe(rows[3]?.measurement.productId);
	});
});
