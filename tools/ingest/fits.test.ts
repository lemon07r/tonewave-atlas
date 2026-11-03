import { describe, expect, it } from 'vitest';
import type { Catalog, Form, Measurement, Product } from '#core/dataset/types.ts';
import { finaliseDefaults, withProvisionalDefaults } from './default-coverage.ts';
import { fitIdentity, mergeFitIdentities } from './fits.ts';
import { isFoldedReference } from './identity-folds.ts';
import { buildRedirects } from './redirects.ts';
import { mergeSampleIdentities } from './samples.ts';
import { mergeSwitchIdentities, reconcileSwitchDefaults } from './switches.ts';
import { identity, variant } from './transform.ts';
import { readInputs, type Phone } from './common.ts';

function fixture(models: string[], form: Form = 'iem', brand = 'Maker') {
	const products = new Map<string, Product>();
	const rows = models.map((model, sourceOrder) => {
		const product = identity(brand, model, form, {});
		const id = `m-${sourceOrder}`;
		products.set(product.id, { ...product, form, measurementIds: [id] });
		const measurement: Measurement = {
			id,
			productId: product.id,
			sourceId: 'source',
			partition: `${form}-5128`,
			variant: {
				id: `v-${sourceOrder}`,
				file: `${brand} ${model}`,
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
				originalUrls: [`https://fixture.invalid/${sourceOrder}`],
				calibrationUrl: null,
				processing: []
			}
		};
		return { measurement, sourceOrder };
	});
	return { products, rows };
}

describe('fit/tip/pad product identities', () => {
	it.each([
		['Tanya DSP S1 (Deep Insertion)', 'Tanya DSP S1', '(Deep Insertion)'],
		['Tanya DSP S2 (Deep Insertion)', 'Tanya DSP S2', '(Deep Insertion)'],
		['ONE DSP (Deep Insertion)', 'ONE DSP', '(Deep Insertion)'],
		['Supermix 5 (Deep Insertion)', 'Supermix 5', '(Deep Insertion)'],
		['K9 Shallow', 'K9', 'Shallow'],
		['K9 Deep', 'K9', 'Deep'],
		['Oracle MKII deep', 'Oracle MKII', 'deep'],
		['S12(Foam)', 'S12', '(Foam)'],
		['HM20(Foam)', 'HM20', '(Foam)'],
		['Model(Sennheiser foam)', 'Model', '(Sennheiser foam)'],
		['Polaris 2025 Stock Tip', 'Polaris 2025', 'Stock Tip'],
		['Polaris 2023 Stock Tip', 'Polaris 2023', 'Stock Tip'],
		['D-FI 2025 Stock Tip', 'D-FI 2025', 'Stock Tip'],
		['D-FI 2026 Stock Tip', 'D-FI 2026', 'Stock Tip'],
		['Sonata 2nd Unit Stock Tip', 'Sonata 2nd Unit', 'Stock Tip'],
		['Star Dragon Stock Tip', 'Star Dragon', 'Stock Tip'],
		['IE900 S2 Stock Tip', 'IE900 S2', 'Stock Tip'],
		["Full Counter 'Graphene Edition' Stock Red Tip", "Full Counter 'Graphene Edition'", 'Stock Red Tip'],
		["Full Counter 'LCP Edition' Stock Red Tip", "Full Counter 'LCP Edition'", 'Stock Red Tip'],
		[
			"Full Counter 'Carbon Nano Tube Edition' Stock Red Tip",
			"Full Counter 'Carbon Nano Tube Edition'",
			'Stock Red Tip'
		],
		['i3 MK3 IE45 PRO Tip', 'i3 MK3', 'IE45 PRO Tip'],
		['HD 650 ZMF Pads', 'HD 650', 'ZMF Pads'],
		['Porta Pro White (Yaxi pads)', 'Porta Pro White', '(Yaxi pads)'],
		['porta pro (yaxi pads)', 'porta pro', '(yaxi pads)'],
		['MDR-7506 (Yaxi Pad)', 'MDR-7506', '(Yaxi Pad)'],
		['KH-KZ1000 (KZ3000 Pad)', 'KH-KZ1000', '(KZ3000 Pad)'],
		['Mi Headphone 1st gen (Velvet Pads)', 'Mi Headphone 1st gen', '(Velvet Pads)'],
		['KPH30i Grado Pads', 'KPH30i', 'Grado Pads'],
		['HD 598 (used pads)', 'HD 598', '(used pads)'],
		['99 Classics V2(foam pads on)', '99 Classics V2', '(foam pads on)'],
		['FT7 pad-rolling', 'FT7', 'pad-rolling'],
		['FT1 Pro pad-rolling', 'FT1 Pro', 'pad-rolling'],
		['JT7 pad-rolling', 'JT7', 'pad-rolling'],
		['Susvara pad-rolling', 'Susvara', 'pad-rolling'],
		['HE500 [Pads Collection]', 'HE500', '[Pads Collection]'],
		['Arya Organic [Pads Collection]', 'Arya Organic', '[Pads Collection]'],
		['Susvara [Pads Collection]', 'Susvara', '[Pads Collection]'],
		['One MK2 - Pads', 'One MK2', '- Pads'],
		['ATH-W100 (W5000 Earpads)', 'ATH-W100', '(W5000 Earpads)'],
		['JVC HA-SHR01 (third-party earpads)', 'JVC HA-SHR01', '(third-party earpads)']
	])('removes only the positioned descriptor from %s', (model, parent, label) => {
		expect(fitIdentity('Maker', model)).toEqual({ parent, label });
	});
	it.each(['PR1(HiFi version foam)', 'PR1(HiFi version pads)', 'Model (2025 edition foam)'])(
		'keeps mixed parenthesized model identity intact: %s',
		(model) => {
			expect(fitIdentity('KZ', model)).toBeNull();
			const { products, rows } = fixture([model], 'iem', 'KZ');
			const before = structuredClone({ products, rows });
			expect(mergeFitIdentities(products, rows).moves).toEqual([]);
			expect({ products, rows }).toEqual(before);
		}
	);
	it.each([
		' (Yaxi pads)',
		' (third-party earpads)',
		' ZMF Pads',
		' pad-rolling',
		' [Pads Collection]',
		' - Pads',
		'(foam pads on)'
	])('keeps a pad product separate without a same-source/partition stock default: %s', (suffix) => {
		const { products, rows } = fixture([`Model${suffix}`], 'headphone');
		const before = structuredClone({ products, rows });
		expect(mergeFitIdentities(products, rows).moves).toEqual([]);
		expect({ products, rows }).toEqual(before);
		finaliseDefaults(products, rows, []);
		expect(rows[0]?.measurement.variant.isDefault).toBe(true);
	});
	it.each(['source', 'partition', 'non-default'])(
		'does not use a mismatching %s base as stock evidence for a pad fold',
		(mismatch) => {
			const { products, rows } = fixture(['Model', 'Model (Yaxi pads)'], 'headphone');
			const base = rows[0]?.measurement;
			if (!base) throw new Error('Missing stock fixture');
			if (mismatch === 'source') base.sourceId = 'other';
			if (mismatch === 'partition') base.partition = 'headphone-711';
			if (mismatch === 'non-default') {
				base.variant.kind = 'tuning';
				base.variant.isDefault = false;
			}
			const before = structuredClone({ products, rows });
			expect(mergeFitIdentities(products, rows).moves).toEqual([]);
			expect({ products, rows }).toEqual(before);
		}
	);
	it('folds pad curves only for eligible sources and retains the other source under its original ID', () => {
		const { products, rows } = fixture(['Model', 'Model (Yaxi pads)'], 'headphone');
		const pad = rows[1];
		if (!pad) throw new Error('Missing pad fixture');
		const retained = structuredClone(pad);
		retained.measurement.id = 'other-source-pad';
		retained.measurement.sourceId = 'other';
		rows.push(retained);
		const id = retained.measurement.productId;
		products.get(id)?.measurementIds.push(retained.measurement.id);
		const result = mergeFitIdentities(products, rows);
		expect(result.moves).toMatchObject([{ from: id, measurements: 1 }]);
		expect(products.get(id)?.measurementIds).toEqual([retained.measurement.id]);
		expect(pad.measurement.productId).toBe(rows[0]?.measurement.productId);
		expect(retained.measurement.productId).toBe(id);
		finaliseDefaults(products, rows, []);
		expect(pad.measurement.variant).toMatchObject({ kind: 'fit', isDefault: false });
		expect(retained.measurement.variant).toMatchObject({ kind: 'default', isDefault: true });
	});
	it('never promotes a folded pad if later partition assignment separates it from stock', () => {
		const { products, rows } = fixture(['Model', 'Model (Yaxi pads)'], 'headphone');
		const base = rows[0]?.measurement,
			pad = rows[1]?.measurement;
		if (!base || !pad) throw new Error('Missing pad fixture');
		mergeFitIdentities(products, rows);
		base.partition = 'headphone-other';
		expect(() => finaliseDefaults(products, rows, [])).toThrow();
		expect(pad.variant.isDefault).toBe(false);
	});
	it('treats used pads as worn stock, retaining ordinary fit-only default coverage', () => {
		const { products, rows } = fixture(['HD 598 (used pads)'], 'headphone');
		expect(mergeFitIdentities(products, rows).moves).toHaveLength(1);
		finaliseDefaults(products, rows, []);
		expect([...products.values()].map((p) => p.model)).toEqual(['HD 598']);
		expect(rows[0]?.measurement.variant).toMatchObject({
			kind: 'default',
			isDefault: true,
			label: 'Maker HD 598 (used pads)'
		});
	});
	it.each(['Model (HiFi version foam)', 'Model (foam pads on)'])(
		'does not let legacy accessory folding bypass the stricter fit rule: %s',
		(model) => {
			const { products, rows } = fixture(['Model', model], 'headphone');
			const base = rows[0]?.measurement;
			if (!base) throw new Error('Missing stock fixture');
			base.sourceId = 'other';
			expect(mergeSwitchIdentities(products, rows).moves).toEqual([]);
			expect(mergeFitIdentities(products, rows).moves).toEqual([]);
			expect(products.size).toBe(2);
		}
	);
	it.each([' (Yaxi pads)', ' ZMF Pads', ' pad-rolling', ' [Pads Collection]', ' - Pads', '(foam pads on)'])(
		'folds a pad only alongside a stock default and keeps it non-default: %s',
		(suffix) => {
			const { products, rows } = fixture(['Model', `Model${suffix}`], 'headphone');
			expect(mergeFitIdentities(products, rows).moves).toHaveLength(1);
			finaliseDefaults(products, rows, []);
			expect(products.size).toBe(1);
			expect(rows.map((r) => [r.measurement.variant.kind, r.measurement.variant.isDefault])).toEqual([
				['default', true],
				['fit', false]
			]);
		}
	);
	it.each([
		['1More', 'Fit Open S50'],
		['Beats', 'Fit Pro'],
		['Sony', 'LinkBuds Fit'],
		['Canpur', 'Deep Blue'],
		['Canpur', 'Deep Blue RE'],
		['Realme', 'Buds Air 5 Pro - Deep Bass'],
		['Headphile', 'Darth Beyer VXD3 Deep Cup'],
		['Acoustune', 'RS ONE (Foam mod)'],
		['iBasso', '3T-154 Foam Mod'],
		['Simgot', 'EA2000 Foam Mod'],
		['BLON', 'BL03 Foam Mod'],
		['TSMR', 'RGB 100 Foam Mod'],
		['HEDD', 'HEDDphone Two - Foam Mod'],
		['Shortbus', 'Olina mod Unknown Soldier 07 Tip'],
		['Shortbus', 'Conch mod Super Cunt 07 Tip'],
		['Shortbus', 'Olina mod Fat Hippie 07 Tip'],
		['Shortbus', "S12 mod Glam X 'Raven' IE45 Tip"],
		['Tanchjim', 'Origin MOD (Tanya Filter, Sponge, H570 Tips) Foam'],
		['Simgot', 'EA1000 RED MOD'],
		['Simgot', 'EA500LM MOD (300 Mesh + Sponge + Silver RED Nozzles)'],
		['Simgot', 'EA1000 ZEUS MOD (Black, 500 Mesh, H570 Tips, 2 Sponges)'],
		['Kiwi Ears', 'Prison Mike Mod'],
		['Shortbus', 'Charmeleon SILVER Modded'],
		['QDC', '8Pro (S)'],
		['Sample', '1 Deep'],
		['Maker', 'Model [modified: foam]'],
		['Maker', 'Model [modified: build] (Yaxi pads)'],
		['Maker', 'Model mod Stock Tip'],
		['Maker', 'Model DIY (Foam)'],
		['Maker', 'Model (Foam Mod)'],
		['Maker', 'Model (prototype) deep'],
		['Maker', 'Model Deep Blue'],
		['Maker', 'Deep'],
		['Maker', '(Foam)']
	])('keeps real, modified or unidentified identities: %s %s', (brand, model) => {
		expect(fitIdentity(brand, model, () => true)).toBeNull();
	});
	it('uses an exact parent for multiword named accessories and preserves model qualifiers', () => {
		expect(fitIdentity('Maker', 'Model S2 Silver Wide Bore Tip', (p) => p === 'Model S2')).toEqual({
			parent: 'Model S2',
			label: 'Silver Wide Bore Tip'
		});
		expect(fitIdentity('Maker', 'Model S2 Stock Tip', (p) => p === 'Model')).toEqual({
			parent: 'Model S2',
			label: 'Stock Tip'
		});
	});
	it.each(['iem', 'headphone'] as const)(
		'retains %s files, labels, tuning kinds and redirect history',
		(form) => {
			const { products, rows } = fixture(['Reference', 'Reference (Foam)', 'Reference Shallow'], form);
			const catalog = (): Catalog => ({
				formatVersion: 1,
				form,
				products: [...products.values()],
				measurements: rows.map((r) => r.measurement),
				sources: [],
				partitions: []
			});
			const previous = structuredClone(catalog());
			const fit = rows[1]?.measurement,
				tuning = rows[2]?.measurement;
			if (!fit || !tuning) throw new Error('Missing fit fixture');
			fit.variant.file = 'Reference F';
			fit.variant.label = 'wide bore';
			tuning.variant.kind = 'tuning';
			tuning.variant.isDefault = false;
			previous.redirects = { products: { ancient: fit.productId }, measurements: { older: fit.id } };
			const originals = rows.map((r) =>
				structuredClone({
					id: r.measurement.id,
					file: r.measurement.variant.file,
					urls: r.measurement.provenance.originalUrls
				})
			);
			const result = mergeFitIdentities(products, rows);
			finaliseDefaults(products, rows, []);
			expect(result.moves).toHaveLength(2);
			expect(products.size).toBe(1);
			expect(rows.map((r) => r.measurement.variant.kind)).toEqual(['default', 'fit', 'tuning']);
			expect(fit.variant.label).toBe('Reference F · wide bore · (Foam)');
			expect(tuning.variant.label).toContain('Shallow');
			expect(isFoldedReference(fit)).toBe(true);
			expect(
				rows.map((r) => ({
					id: r.measurement.id,
					file: r.measurement.variant.file,
					urls: r.measurement.provenance.originalUrls
				}))
			).toEqual(originals);
			const current = catalog();
			expect(buildRedirects([previous], [current])).toMatchObject({ products: 2, measurements: 0 });
			expect(current.redirects?.products).toEqual({
				ancient: fit.productId,
				[previous.products[1]?.id ?? 'missing']: fit.productId,
				[previous.products[2]?.id ?? 'missing']: fit.productId
			});
			expect(current.redirects?.measurements).toEqual({ older: fit.id });
		}
	);
	it('synthesizes alias-resolved bases without losing source spelling in labels', async () => {
		const { productAliases } = await readInputs();
		const { products, rows } = fixture(['Aria II(Foam)'], 'iem', 'MOONDROP');
		const result = mergeFitIdentities(products, rows, {}, productAliases);
		expect([...products.values()]).toMatchObject([
			{ id: identity('MOONDROP', 'Aria 2', 'iem', {}).id, model: 'Aria 2' }
		]);
		expect(result.created).toHaveLength(1);
		expect(rows[0]?.measurement.variant.label).toContain('Aria II(Foam)');
	});
	it.each([1, 2])('never replaces %i existing base default(s) with a preferred-state fit', (baseDefaults) => {
		const { products, rows } = fixture(['Model', 'Model (Foam)']);
		const base = rows[0],
			fit = rows[1];
		if (!base || !fit) throw new Error('Missing switch fixture');
		base.measurement.variant.file = 'Maker Model DD';
		fit.measurement.variant.file = 'Maker Model DU';
		if (baseDefaults === 2) {
			const second = structuredClone(base);
			second.measurement.id = 'second-base';
			second.measurement.variant.file = 'Maker Model UU';
			second.sourceOrder = 2;
			rows.push(second);
		}
		for (const source of ['other-a', 'other-b']) {
			const vote = structuredClone(base);
			vote.measurement.id = source;
			vote.measurement.sourceId = source;
			vote.measurement.variant.file = 'Maker Model DU';
			rows.push(vote);
		}
		mergeFitIdentities(products, rows);
		const { decisions } = reconcileSwitchDefaults(products, rows);
		expect(decisions[0]?.preferred).toBe('switch:du:du');
		finaliseDefaults(products, rows, decisions);
		expect(fit.measurement.variant).toMatchObject({ kind: 'fit', isDefault: false });
		expect(
			rows.filter((r) => r.measurement.sourceId === 'source' && r.measurement.variant.isDefault)
		).toEqual([base]);
	});
	it('protects multiple base defaults during final coverage independently of reconciliation', () => {
		const { products, rows } = fixture(['Model', 'Model (Foam)']);
		const base = rows[0],
			fit = rows[1];
		if (!base || !fit) throw new Error('Missing fixture');
		base.measurement.variant.file = 'Model DD';
		fit.measurement.variant.file = 'Model DU';
		const second = structuredClone(base);
		second.measurement.id = 'second';
		rows.push(second);
		mergeFitIdentities(products, rows);
		finaliseDefaults(products, rows, [{ productId: base.measurement.productId, preferred: 'switch:du:du' }]);
		expect(base.measurement.variant.isDefault).toBe(true);
		expect(fit.measurement.variant).toMatchObject({ kind: 'fit', isDefault: false });
	});
	it('selects a fit-only source default, restores provisional choices and separates final partitions', () => {
		const { products, rows } = fixture(['Model', 'Model (Foam)', 'Model Shallow']);
		const base = rows[0]?.measurement,
			fit = rows[1]?.measurement,
			other = rows[2]?.measurement;
		if (!base || !fit || !other) throw new Error('Missing coverage fixture');
		base.sourceId = 'stock';
		other.partition = 'iem-711';
		mergeFitIdentities(products, rows);
		expect(
			withProvisionalDefaults(products, rows, [], () => rows.every((r) => r.measurement.variant.isDefault))
				.value
		).toBe(true);
		expect(rows.map((r) => r.measurement.variant.kind)).toEqual(['default', 'fit', 'fit']);
		finaliseDefaults(products, rows, []);
		expect(rows.every((r) => r.measurement.variant.isDefault)).toBe(true);
		expect(fit.variant.label).toContain('(Foam)');
	});
	it.each(['iem', 'headphone'] as const)(
		'keeps sample identity stronger than fit metadata through the complete %s folding pipeline',
		(form) => {
			const { products, rows } = fixture(['Model (sample 2) (Foam)', 'Model (sample 1) (Foam)'], form);
			const originalFiles = rows.map((r) => r.measurement.variant.file);
			expect(mergeSampleIdentities(products, rows).moves).toHaveLength(2);
			expect(rows.map((r) => r.measurement.variant.kind)).toEqual(['unit', 'unit']);
			mergeSwitchIdentities(products, rows);
			expect(mergeFitIdentities(products, rows).moves).toHaveLength(1);
			expect(mergeSampleIdentities(products, rows).moves).toEqual([]);
			const foldedKinds = rows.map((r) => r.measurement.variant.kind);
			const { decisions } = reconcileSwitchDefaults(products, rows);
			finaliseDefaults(products, rows, decisions);
			expect({ foldedKinds, defaults: rows.map((r) => r.measurement.variant.isDefault) }).toEqual({
				foldedKinds: ['unit', 'unit'],
				defaults: [false, true]
			});
			expect(rows.map((r) => r.measurement.variant.kind)).toEqual(['unit', 'default']);
			expect(rows.map((r) => r.measurement.variant.file)).toEqual(originalFiles);
			expect([...products.values()].map((p) => p.model)).toEqual(['Model']);
			for (const [i, row] of rows.entries()) {
				expect(row.measurement.variant.label).toContain(`(sample ${2 - i})`);
				expect(row.measurement.variant.label).toContain('(Foam)');
				expect(row.measurement.provenance.processing).toContainEqual(
					expect.stringContaining('recognized sample/unit identity:')
				);
				expect(row.measurement.provenance.processing).toContainEqual(
					expect.stringContaining('recognized fit identity:')
				);
			}
			expect(rows[1]?.measurement.provenance.processing).toContain(
				'default coverage: deterministic coverage fallback; previous kind unit; original label retained'
			);
		}
	);
	it('keeps file-level replacement samples as units through fit and switch folding, selecting sample 2 before sample 3', () => {
		const phone: Phone = {
			brand: 'Maker',
			name: 'Model Deep',
			file: ['Model Deep Sample 3', 'Model Deep Sample 2'],
			suffix: [],
			price: null,
			reviewLink: null
		};
		const { products, rows } = fixture([phone.name]);
		const first = rows[0];
		if (!first) throw new Error('Missing file-level sample fixture');
		const second = structuredClone(first);
		second.measurement.id = 'm-1';
		second.sourceOrder = 1;
		rows.push(second);
		const product = products.get(first.measurement.productId);
		if (!product) throw new Error('Missing file-level sample product');
		product.measurementIds.push(second.measurement.id);
		for (const [i, row] of rows.entries()) row.measurement.variant = variant(phone, i, row.measurement.id);
		const units = [
			{ kind: 'unit', isDefault: false },
			{ kind: 'unit', isDefault: false }
		];
		expect(rows.map((r) => r.measurement.variant)).toMatchObject(units);
		expect(mergeSampleIdentities(products, rows).moves).toEqual([]);
		expect(mergeSwitchIdentities(products, rows).moves).toEqual([]);
		expect(mergeFitIdentities(products, rows).moves).toHaveLength(1);
		expect(rows.map((r) => r.measurement.variant)).toMatchObject(units);
		expect(mergeSampleIdentities(products, rows).moves).toEqual([]);
		expect([...products.values()].map((p) => p.model)).toEqual(['Model']);

		// Exercise the unit exclusion with a real preferred-state vote, not an early no-state return.
		const switchRows = structuredClone(rows);
		for (const row of switchRows) row.measurement.variant.label += ' · DU';
		for (const [i, state] of ['DU', 'DD'].entries()) {
			const vote = structuredClone(first);
			vote.measurement.id = `m-vote-${i}`;
			vote.measurement.sourceId = 'other-source';
			vote.measurement.provenance.sourceId = 'other-source';
			vote.measurement.provenance.processing = [];
			vote.measurement.variant = {
				id: `v-vote-${i}`,
				file: `Model ${state}`,
				label: state,
				kind: i === 0 ? 'default' : 'tuning',
				isDefault: i === 0
			};
			switchRows.push(vote);
		}
		const switchProducts = structuredClone(products);
		const base = switchProducts.get(first.measurement.productId);
		if (!base) throw new Error('Missing switch-vote base');
		base.measurementIds = switchRows.map((r) => r.measurement.id);
		const switched = reconcileSwitchDefaults(switchProducts, switchRows);
		expect(switched.decisions).toMatchObject([
			{ preferred: 'switch:du:du', changedSources: [], unresolvedSources: ['source'] }
		]);
		expect(switchRows.slice(0, 2).map((r) => r.measurement.variant)).toMatchObject(units);
		finaliseDefaults(switchProducts, switchRows, switched.decisions);
		expect(switchRows.slice(0, 2).map((r) => r.measurement.variant.isDefault)).toEqual([false, true]);

		const { decisions } = reconcileSwitchDefaults(products, rows);
		expect(rows.map((r) => r.measurement.variant)).toMatchObject(units);
		finaliseDefaults(products, rows, decisions);
		expect(rows.map((r) => r.measurement.variant.kind)).toEqual(['unit', 'default']);
		expect(rows.map((r) => r.measurement.variant.isDefault)).toEqual([false, true]);
		expect(rows.map((r) => r.measurement.variant.file)).toEqual(phone.file);
		for (const [i, row] of rows.entries()) {
			expect(row.measurement.variant.label).toContain(phone.file[i]);
			expect(row.measurement.variant.label).toContain('Deep');
		}
		expect(second.measurement.provenance.processing).toContain(
			'default coverage: deterministic coverage fallback; previous kind unit; original label retained'
		);
	});
	it('composes explicit sample folding after fit folding, not bare S2/year/unit model qualifiers', () => {
		const { products, rows } = fixture([
			'Model',
			'Model Sample 2 (Foam)',
			'Model S2 Stock Tip',
			'Model 2025 Stock Tip',
			'Model 2nd Unit Stock Tip'
		]);
		mergeFitIdentities(products, rows);
		mergeSampleIdentities(products, rows);
		expect([...products.values()].map((p) => p.model).sort()).toEqual([
			'Model',
			'Model 2025',
			'Model 2nd Unit',
			'Model S2'
		]);
		expect(rows[1]?.measurement.productId).toBe(rows[0]?.measurement.productId);
		expect(rows[1]?.measurement.variant).toMatchObject({ kind: 'unit', isDefault: false });
		expect(rows[1]?.measurement.variant.label).toContain('(Foam)');
	});
});
