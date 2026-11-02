import { describe, expect, it } from 'vitest';
import type { Measurement, Product } from '#core/dataset/types.ts';
import type { Phone } from './common.ts';
import { mergeSwitchIdentities, reconcileSwitchDefaults } from './switches.ts';
import { adapterState, stateSuffix, switchState, tipSuffixes } from './variant-labels.ts';
import { variant } from './transform.ts';
import { assertDefaultCoverage, finaliseDefaults } from './default-coverage.ts';

function row(
	source: string,
	file: string,
	isDefault = true,
	productId = 'parent',
	kind: Measurement['variant']['kind'] = isDefault ? 'default' : 'tuning'
) {
	const id = `${source}:${file}`;
	const measurement: Measurement = {
		id,
		sourceId: source,
		productId,
		partition: 'iem-711',
		variant: { id: `v-${id}`, file, label: file, kind, isDefault },
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
			sourceId: source,
			databaseUrl: 'https://fixture.invalid/',
			originalUrls: [],
			calibrationUrl: null,
			processing: []
		}
	};
	return { measurement };
}
const product = (id = 'parent', model = 'Volume S'): Product => ({
	id,
	brand: 'Softears',
	model,
	form: 'iem',
	measurementIds: []
});

describe('final partition-aware default coverage', () => {
	const products = () => new Map([['parent', product()]]);
	it.each(['unit', 'fit', 'unknown', 'tuning'] as const)(
		'promotes a sole %s without erasing its meaning',
		(kind) => {
			const rows = [row('only', 'Volume S Sample 2', false, 'parent', kind)];
			expect(() => {
				assertDefaultCoverage(products(), rows, []);
			}).toThrow('no default');
			const result = finaliseDefaults(products(), rows, []);
			expect(rows[0]?.measurement.variant).toMatchObject({ kind, isDefault: true });
			expect(result.after.productPartitions.withoutDefault).toBe(0);
		}
	);
	it('chooses the lowest sample number, stock fit, and existing tuning tie-break', () => {
		const rows = [
			row('units', 'Volume S sample 3', false, 'parent', 'unit'),
			row('units', 'Volume S sample 2', false, 'parent', 'unit'),
			row('fits', 'Volume S foam tips', false, 'parent', 'fit'),
			row('fits', 'Volume S stock tips', false, 'parent', 'fit'),
			row('tuning', 'Volume S ANC On', false),
			row('tuning', 'Volume S ANC Off', false)
		];
		finaliseDefaults(products(), rows, []);
		expect(
			rows.filter((r) => r.measurement.variant.isDefault).map((r) => r.measurement.variant.file)
		).toEqual(['Volume S sample 2', 'Volume S stock tips', 'Volume S ANC Off']);
	});
	it('permits missing selected states only with defaults in the same final partition', () => {
		const rows = [
			row('canonical', 'Volume S DD'),
			row('mismatch', 'Volume S UU', false),
			row('isolated', 'Volume S UU', false)
		];
		const isolated = rows[2];
		if (!isolated) throw new Error('Missing fixture');
		isolated.measurement.partition = 'iem-unknown-isolated';
		const decisions = [{ productId: 'parent', preferred: 'switch:du:dd' }];
		expect(() => {
			assertDefaultCoverage(products(), rows, decisions);
		}).toThrow('no default');
		const result = finaliseDefaults(products(), rows, decisions);
		expect(result.exceptions.map((e) => e.source)).toEqual(['mismatch']);
		expect(isolated.measurement.variant.isDefault).toBe(true);
		expect(result.after.productPartitions.withoutDefault).toBe(0);
		const sameState = [row('canonical', 'Volume S DD'), row('missing', 'Volume S DD', false)];
		expect(() => {
			assertDefaultCoverage(products(), sameState, decisions);
		}).toThrow('unjustified missing source default');
	});
	it('does not exempt singleton units/fits/unknowns even when another source supplies the selected state', () => {
		const rows = [
			row('canonical', 'Volume S DD'),
			row('sample', 'Volume S sample 2', false, 'parent', 'unit')
		];
		finaliseDefaults(products(), rows, [{ productId: 'parent', preferred: 'switch:du:dd' }]);
		expect(rows[1]?.measurement.variant.isDefault).toBe(true);
	});
	it('resolves multiple defaults with a selected labelled state, otherwise preserves and reports them', () => {
		const rows = [
			row('resolved', 'Volume S UU'),
			row('resolved', 'Volume S DD'),
			row('unresolved', 'Volume S 00'),
			row('unresolved', 'Volume S 11')
		];
		const result = finaliseDefaults(products(), rows, [{ productId: 'parent', preferred: 'switch:du:dd' }]);
		expect(rows.slice(0, 2).map((r) => r.measurement.variant.isDefault)).toEqual([false, true]);
		expect(rows.slice(2).map((r) => r.measurement.variant.isDefault)).toEqual([true, true]);
		expect(result.unresolvedMultipleDefaults.map((g) => g.source)).toEqual(['unresolved']);
	});
	it('preserves multiple defaults through reconciliation when the selected encoding is absent', () => {
		const rows = [
			row('a', 'Volume S DD'),
			row('b', 'Volume S DD'),
			row('mixed', 'Volume S 00'),
			row('mixed', 'Volume S 11')
		];
		const decisions = reconcileSwitchDefaults(products(), rows).decisions;
		expect(decisions[0]?.preferred).toBe('switch:du:dd');
		expect(rows.slice(2).map((r) => r.measurement.variant.isDefault)).toEqual([true, true]);
		const final = finaliseDefaults(products(), rows, decisions);
		expect(final.unresolvedMultipleDefaults.map((g) => g.source)).toEqual(['mixed']);
	});
});

describe('switch-state identity and source-balanced defaults', () => {
	it.each(['High Impedence', 'high imp', 'High Impedance', 'Impedance Dial: High'])(
		'reads explicit impedance spelling: %s',
		(text) => {
			expect(switchState(text)).toBe('impedance:high');
		}
	);
	it('distinguishes adapter loading and preserves DU versus bit encoding', () => {
		expect(adapterState('Low+10ohm')).toBe('adapter:10ohm');
		expect(switchState('(switches: DD)')).toBe('switch:du:dd');
		expect(switchState('(switches: 00)')).toBe('switch:bits:00');
		expect(switchState('(switches: 00)')).not.toBe(switchState('(switches: DD)'));
	});
	it('recognizes grouped eight-switch codes without changing their encoding', () => {
		expect(stateSuffix('VZ10 DDDD DDDU')).toEqual({ parent: 'VZ10', label: 'DDDD DDDU' });
		expect(switchState('(switches: DDDD DDDU)')).toBe('switch:du:dddddddu');
		expect(switchState('(Bass: Off, Treble: On)')).toBe('switch:named:bass=off,treble=on');
	});
	it.each([
		'High Impedence',
		'high imp',
		'Low+10ohm',
		'10ohm',
		'+15 Ohm',
		'impedance adapter 10 ohm',
		'stock silicone tips, high impedance'
	])('classifies product state before incidental fit: %s', (label) => {
		const p: Phone = {
			brand: 'Softears',
			name: 'Volume S',
			file: ['Softears Volume S', `Softears Volume S ${label}`],
			suffix: ['', label],
			price: null,
			reviewLink: null
		};
		expect(variant(p, 1, 'm-fixture')).toMatchObject({ kind: 'tuning', isDefault: false });
	});
	it.each(['CP100', 'CP145', 'Zero wide bore', 'ABP-T tip'])('identifies a tip descriptor: %s', (label) => {
		const p: Phone = {
			brand: 'Softears',
			name: 'Volume S',
			file: ['Volume S', `Volume S ${label}`],
			suffix: ['', label],
			price: null,
			reviewLink: null
		};
		expect(variant(p, 1, 'm-fixture').kind).toBe('fit');
	});
	it('folds only exact accepted parents and carries the original state label', () => {
		const products = new Map(
			[
				product(),
				product('high', 'Volume S High Imp'),
				product('low', 'Volume S Low Imp'),
				product('missing', 'Other High Imp'),
				product('distinct', 'Volume S Pro')
			].map((p) => [p.id, p])
		);
		const rows = [row('store', 'High', true, 'high'), row('store', 'Low', true, 'low')];
		for (const r of rows) products.get(r.measurement.productId)?.measurementIds.push(r.measurement.id);
		const result = mergeSwitchIdentities(products, rows);
		expect(result.moves).toHaveLength(2);
		expect(products.size).toBe(3);
		expect(products.has('missing')).toBe(true);
		expect(products.has('distinct')).toBe(true);
		expect(rows.map((r) => r.measurement.productId)).toEqual(['parent', 'parent']);
		expect(rows[0]?.measurement.variant.label).toContain('High Imp');
		expect(stateSuffix('Volume S2')).toBeNull();
		expect(stateSuffix('Volume S Pro')).toBeNull();
	});
	it('folds cable/termination names only with an accepted exact parent and retains a sole default', () => {
		const products = new Map(
			[
				product(),
				product('cable', 'Volume S (Standard 4.4mm)'),
				product('named', 'Volume S with IMR Cable'),
				product('missing', 'Missing (3.5mm)'),
				product('balanced', 'Volume S Balanced')
			].map((p) => [p.id, p])
		);
		const rows = [row('joyce', 'cable', true, 'cable'), row('other', 'named', true, 'named')];
		const result = mergeSwitchIdentities(products, rows);
		expect(result.moves.map((m) => m.kind)).toEqual(['cable', 'cable']);
		expect(rows.every((r) => r.measurement.productId === 'parent' && r.measurement.variant.isDefault)).toBe(
			true
		);
		expect(products.has('missing')).toBe(true);
		expect(products.has('balanced')).toBe(true);
		expect(rows[0]?.measurement.variant.label).toContain('Standard 4.4mm');
	});
	it('makes additional cable choices setup variants, selecting an explicit standard deterministically', () => {
		const products = new Map(
			[product(), product('a', 'Volume S (Custom 4.4mm)'), product('b', 'Volume S (Standard 4.4mm)')].map(
				(p) => [p.id, p]
			)
		);
		const rows = [row('source', 'custom', true, 'a'), row('source', 'standard', true, 'b')];
		mergeSwitchIdentities(products, rows);
		expect(rows.map((r) => r.measurement.variant.kind)).toEqual(['setup', 'default']);
		expect(rows.map((r) => r.measurement.variant.isDefault)).toEqual([false, true]);
	});
	it('preserves impedance-load and fit labels when a generic plug or cable identity joins stock', () => {
		const products = new Map([product(), product('plug', 'Volume S PLUG')].map((p) => [p.id, p]));
		const rows = [
			row('source', 'Volume S stock'),
			row('source', 'Volume S PLUG (220 Ohm)', false, 'plug'),
			row('source', 'Volume S PLUG CP145', false, 'plug', 'fit')
		];
		mergeSwitchIdentities(products, rows);
		expect(rows.map((r) => r.measurement.variant.kind)).toEqual(['default', 'tuning', 'fit']);
	});
	it.each(['DSP Cable', 'Bass plug'])(
		'does not make a non-neutral accessory a bare default: %s',
		(suffix) => {
			const products = new Map([product(), product('cable', `Volume S ${suffix}`)].map((p) => [p.id, p]));
			const rows = [row('source', `Volume S ${suffix}`, true, 'cable')];
			mergeSwitchIdentities(products, rows);
			expect(rows[0]?.measurement.variant).toMatchObject({ kind: 'tuning', isDefault: false });
		}
	);
	it('does not consume sample or fit identity words as part of a cable name', () => {
		const products = new Map(
			[product(), product('sample', 'Volume S S2 CABLE'), product('fit', 'Volume S Foam Cable')].map((p) => [
				p.id,
				p
			])
		);
		const rows = [row('source', 'Volume S S2 CABLE', true, 'sample')];
		const result = mergeSwitchIdentities(products, rows);
		expect(result.moves).toHaveLength(0);
		expect(products.has('sample')).toBe(true);
		expect(products.has('fit')).toBe(true);
	});
	it.each(['Stock Tip', 'Azla tips', 'foam', 'wide bore', 'CP100', '(CP145)', 'JVC Spiral Dot++'])(
		'folds an exact tip parent and keeps a sole source measurement default: %s',
		(suffix) => {
			const products = new Map([product(), product('tip', `Volume S ${suffix}`)].map((p) => [p.id, p]));
			const rows = [row('source', `Volume S ${suffix}`, true, 'tip')];
			const result = mergeSwitchIdentities(products, rows);
			expect(result.moves[0]?.kind).toBe('tip');
			expect(rows[0]?.measurement).toMatchObject({
				productId: 'parent',
				variant: { kind: 'default', isDefault: true }
			});
			expect(rows[0]?.measurement.variant.label).toContain(suffix);
		}
	);
	it('keeps additional tips fit, preferring stock deterministically without erasing load/unit meaning', () => {
		const products = new Map(
			[product(), product('foam', 'Volume S Foam'), product('stock', 'Volume S Stock Tip')].map((p) => [
				p.id,
				p
			])
		);
		const rows = [
			row('source', 'Volume S Foam', true, 'foam'),
			row('source', 'Volume S Stock Tip', true, 'stock'),
			row('source', 'Volume S Foam 15 Ohm', false, 'foam'),
			row('source', 'Volume S Foam Unit 2', false, 'foam', 'unit'),
			row('source', 'Volume S stock')
		];
		const result = mergeSwitchIdentities(products, rows);
		expect(rows.map((r) => r.measurement.variant.kind)).toEqual(['fit', 'default', 'tuning', 'unit', 'fit']);
		expect(result.tipDefaultChanges).toHaveLength(1);
	});
	it('requires an exact accepted tip parent and does not absorb sample/revision/state prefixes', () => {
		const products = new Map(
			[
				product(),
				product('missing', 'Other Stock Tip'),
				product('sample', 'Volume S S2 Foam'),
				product('designator', 'Volume S Pro Stock Tip')
			].map((p) => [p.id, p])
		);
		expect(mergeSwitchIdentities(products, []).moves).toHaveLength(0);
		for (const text of [
			'Volume S S2 Foam',
			'Volume S Rev2 Stock Tip',
			'Volume S 2025 Stock Tip',
			'Volume S Pro Stock Tip',
			'Volume S Max Foam',
			'Volume S II Foam',
			'Volume S 2 Foam',
			'Volume S S Foam',
			'Volume S Ultra tips',
			'Volume S Plus tips',
			'Volume S X2 Foam'
		])
			expect(tipSuffixes(text).some((s) => s.parent === 'Volume S')).toBe(false);
		expect(tipSuffixes('Volume S (Spring Tips)')).toEqual([{ parent: 'Volume S', label: '(Spring Tips)' }]);
	});
	it.each(['02 Foam', '12 Foam', 'mystery tips', 'Harman Stock Tip', 'High Impedance tips'])(
		'folds mixed tip/settings suffixes as non-default tuning: %s',
		(suffix) => {
			const products = new Map(
				[product('parent', 'T4'), product('tip', `T4 ${suffix}`)].map((p) => [p.id, p])
			);
			const rows = [row('source', `T4 ${suffix}`, true, 'tip')];
			const result = mergeSwitchIdentities(products, rows);
			expect(rows[0]?.measurement).toMatchObject({
				productId: 'parent',
				variant: { kind: 'tuning', isDefault: false }
			});
			expect(result.moves[0]?.ambiguousTokens?.length).toBeGreaterThan(0);
			expect(result.tipAmbiguities).toHaveLength(1);
		}
	);
	it('keeps Studio 4 Stock Tip fit when the source already has its default', () => {
		const products = new Map(
			[product('parent', 'Studio 4'), product('tip', 'Studio 4 Stock Tip')].map((p) => [p.id, p])
		);
		const rows = [row('source', 'Studio 4'), row('source', 'Studio 4 Stock Tip', false, 'tip', 'fit')];
		mergeSwitchIdentities(products, rows);
		expect(rows[1]?.measurement).toMatchObject({
			productId: 'parent',
			variant: { kind: 'fit', isDefault: false }
		});
	});
	it('does not let a switch plurality promote an ambiguous mixed tip suffix', () => {
		const products = new Map(
			[product(), product('tip', 'Volume S switches DD mystery Foam')].map((p) => [p.id, p])
		);
		const rows = [
			row('a', 'Volume S DD'),
			row('b', 'Volume S DD'),
			row('other', 'Volume S UU'),
			row('mixed', 'Volume S switches DD mystery Foam', true, 'tip')
		];
		mergeSwitchIdentities(products, rows);
		reconcileSwitchDefaults(products, rows);
		expect(rows[3]?.measurement.variant).toMatchObject({ kind: 'tuning', isDefault: false });
	});
	it('promotes a sole accepted neutral tip measurement without promoting loads or units', () => {
		const products = new Map([product(), product('tip', 'Volume S CP100')].map((p) => [p.id, p]));
		const rows = [row('source', 'Volume S CP100', false, 'tip', 'fit')];
		mergeSwitchIdentities(products, rows);
		expect(rows[0]?.measurement.variant).toMatchObject({ kind: 'default', isDefault: true });
	});
	it('selects the most source-default state, not the most measured state; leaves unlabeled data intact', () => {
		const products = new Map([['parent', product()]]);
		const rows = [
			row('aden', 'Low Impedance'),
			row('precog', 'Low Impedance'),
			row('obodio', 'High Impedance'),
			row('obodio', 'Low Impedance', false),
			row('unlabelled', 'stock')
		];
		for (let i = 0; i < 20; i++) rows.push(row('obodio', `High Impedance tip ${i}`, false));
		const result = reconcileSwitchDefaults(products, rows);
		expect(result.decisions[0]?.votes).toEqual({ 'impedance:low': 2, 'impedance:high': 1 });
		expect(result.decisions[0]?.preferred).toBe('impedance:low');
		expect(result.products).toBe(1);
		expect(result.productSources).toBe(1);
		expect(
			rows.find((r) => r.measurement.sourceId === 'obodio' && r.measurement.variant.isDefault)?.measurement
				.variant.file
		).toBe('Low Impedance');
		expect(rows.find((r) => r.measurement.sourceId === 'unlabelled')?.measurement.variant.isDefault).toBe(
			true
		);
	});
	it('does not promote adapters, ambiguous EQ or replacement units', () => {
		const products = new Map([['parent', product()]]);
		const rows = [
			row('a', 'Low Impedance'),
			row('b', 'Low Impedance'),
			row('c', 'High Impedance'),
			row('c', 'Low Impedance +15 Ohm', false),
			row('c', 'Low Impedance EQ1', false),
			row('c', 'Low Impedance Unit 2', false, 'parent', 'unit')
		];
		reconcileSwitchDefaults(products, rows);
		expect(
			rows.filter((r) => r.measurement.sourceId === 'c' && r.measurement.variant.isDefault)
		).toHaveLength(0);
	});
	it('keeps same-state tips as fit but different-state tips as tuning', () => {
		const products = new Map([['parent', product()]]);
		const rows = [
			row('a', 'Low Impedance'),
			row('b', 'Low Impedance'),
			row('b', 'Low Impedance CP100', false, 'parent', 'fit'),
			row('b', 'High Impedance CP145', false, 'parent', 'fit')
		];
		reconcileSwitchDefaults(products, rows);
		expect(rows[2]?.measurement.variant.kind).toBe('fit');
		expect(rows[3]?.measurement.variant.kind).toBe('tuning');
	});
	it('does not use adapter fallback when every stock measurement is a replacement unit', () => {
		const p: Phone = {
			brand: 'CrinEar',
			name: 'Reference',
			file: ['CrinEar Reference S2', 'CrinEar Reference 75', 'CrinEar Reference Sample 3'],
			suffix: ['', '(75ohm Adapter)', 'Sample 3'],
			price: null,
			reviewLink: null
		};
		expect(variant(p, 0, 'm-unit').kind).toBe('unit');
		expect(variant(p, 1, 'm-adapter')).toMatchObject({ kind: 'tuning', isDefault: false });
	});
	it('reads filename switch codes even when the suffix uses words', () => {
		const products = new Map([['parent', product()]]);
		const rows = [
			row('a', 'Volume S DD'),
			row('b', 'Volume S DD'),
			row('c', 'Volume S UU'),
			row('c', 'Volume S DD', false)
		];
		for (const r of rows)
			r.measurement.variant.label = r.measurement.variant.file.endsWith('DD') ? '(down - down)' : '(up - up)';
		const result = reconcileSwitchDefaults(products, rows);
		expect(result.decisions[0]?.preferred).toBe('switch:du:dd');
		expect(rows[2]?.measurement.variant.isDefault).toBe(false);
		expect(rows[3]?.measurement.variant.isDefault).toBe(true);
	});
	it('removes stock model words from suffixes before classifying', () => {
		const p: Phone = {
			brand: 'CrinEar',
			name: 'Reference',
			file: ['CrinEar Reference', 'CrinEar Reference CP145', 'CrinEar Reference unidentified'],
			suffix: ['', 'CrinEar Reference CP145', 'CrinEar Reference unidentified'],
			price: null,
			reviewLink: null
		};
		expect(variant(p, 1, 'm-tip').kind).toBe('fit');
		expect(variant(p, 2, 'm-unknown').kind).toBe('unknown');
	});
	it('abstains on ties and never equates 00 with DD', () => {
		const products = new Map([['parent', product()]]);
		const rows = [row('a', '(switches: DD)'), row('b', '(switches: 00)')];
		const result = reconcileSwitchDefaults(products, rows);
		expect(result.decisions[0]?.preferred).toBeNull();
		expect(result.products).toBe(0);
		expect(rows.every((r) => r.measurement.variant.isDefault)).toBe(true);
	});
	it('uses deterministic source order to select one canonical state after split identities join', () => {
		const products = new Map(
			[product(), product('high', 'Volume S High Imp'), product('low', 'Volume S Low Imp')].map((p) => [
				p.id,
				p
			])
		);
		const rows = [
			row('a', 'Low Impedance'),
			row('b', 'Low Impedance'),
			row('store', 'high', true, 'high'),
			row('store', 'low', true, 'low')
		];
		mergeSwitchIdentities(products, rows);
		const result = reconcileSwitchDefaults(products, rows);
		expect(result.decisions[0]?.votes).toEqual({ 'impedance:low': 2 });
		expect(
			rows
				.filter((r) => r.measurement.sourceId === 'store' && r.measurement.variant.isDefault)
				.map((r) => r.measurement.variant.file)
		).toEqual(['low']);
	});
});
