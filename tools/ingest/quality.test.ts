import { describe, expect, it } from 'vitest';
import type { Phone } from './common.ts';
import { derivedName, nonProductName } from './common.ts';
import {
	cleanEntry,
	curveProblem,
	duplicateDefault,
	entryForm,
	identityProblem,
	modification,
	partitionFor
} from './quality.ts';
import { identity, sampleContext, sourceFor, variant } from './transform.ts';
import { RANK_GRID } from '#core/grid.ts';

const db = {
	id: 'fixture',
	username: 'fixture',
	name: 'Fixture',
	url: 'https://fixture.invalid/',
	dbType: 'IEMs'
};
const source = sourceFor(db, '', '2026-11-02', {});
const phone = (brand = 'Maker', name = 'Model', file = ['Model']): Phone => ({
	brand,
	name,
	file,
	suffix: [],
	price: null,
	reviewLink: null
});

describe('deterministic catalog quality rules', () => {
	it.each(['Test', 'DAC Test', 'AMP TEST', 'Cable Test', '[Source-chain comparison]'])(
		'quarantines an exact non-transducer category, including its Reference: %s',
		(brand) => {
			expect(identityProblem(brand, 'Reference')).toBe('source-chain test category');
		}
	);
	it.each([
		'Pocket DAC',
		'S8 Pro Robin Dongle',
		'Desktop Amplifier',
		'Pocket DAC with amplifier',
		'Pocket Dongle via DAC'
	])('quarantines a model declared as source-chain equipment: %s', (model) => {
		expect(identityProblem('Maker', model)).toBe('source-chain device, not a transducer');
	});
	it.each([
		['Maker', 'Test Pilot'],
		['Snowy', 'Test HT'],
		['Snowy88', 'Leo Test'],
		['ITK', 'Unknown Model'],
		['Maker', 'Reference'],
		['Reference', 'One'],
		['Simgot', 'EG280 With DAC'],
		['Maker', 'Model via amplifier'],
		['Contest', 'One']
	])('retains a named transducer or its setup: %s %s', (brand, model) => {
		expect(identityProblem(brand, model)).toBeNull();
	});
	it('treats a headphone-test category as form metadata, not a maker or source-chain test', () => {
		const p = phone('HP Test', 'Maker Model', ['HP Test Maker Model']);
		expect(entryForm(p).form).toBe('headphone');
		expect(cleanEntry(p, source, ['Maker'])).toMatchObject({ brand: 'Maker', name: 'Model', file: p.file });
		expect(cleanEntry(phone('HP Test', 'HEDD2'), source, [])).toMatchObject({
			brand: 'Unbranded (fixture)',
			name: 'HEDD2'
		});
		expect(identityProblem('HP Test', 'HEDD2')).toBeNull();
	});
	it.each(['evidenced', 'verified'] as const)(
		'does not route headphone rows using an IEM %s 5128 family',
		(evidenceClass) => {
			const source = sourceFor(
				{ id: 'mixed', username: 'mixed', name: 'Mixed', url: 'https://mixed.invalid/', dbType: 'IEMs' },
				'',
				'date',
				{}
			);
			source.rigEvidence = { class: evidenceClass, family: '5128', rationale: 'IEM rig evidence' };
			expect(partitionFor(source, 'iem')).toBe('iem-5128');
			expect(partitionFor(source, 'headphone', entryForm(phone('HP Test', 'Model')).sourceIsolated)).toBe(
				'headphone-source-mixed'
			);
			const physical = sourceFor(
				{ ...source, dbType: 'Headphones' },
				'rig_description="B&K 5128"',
				'date',
				{}
			);
			physical.rigEvidence = source.rigEvidence;
			expect(partitionFor(physical, 'headphone')).toBe('headphone-5128');
		}
	);
	it.each([
		'Average IEM',
		'Average Headphone',
		'IE900 + EQ',
		'Moondrop May (User EQ)',
		'Sennheiser IE400 Pro (h0llow EQ)',
		'EQed AKG N400',
		'QCU Aware + EQ (-4,0,-4)',
		'Aeolus EQ applied'
	])('excludes non-stock curve %s', (name) => {
		expect(derivedName(name)).not.toBeNull();
	});
	it.each([
		'Fatfreq Deuce',
		'Oriveti bleqk Dynabird',
		'Fearless Tequila',
		'SuperEQ Q2 Pro',
		'Ecoustic EQ-100',
		'Neodots No EQ',
		'Moondrop Rays EQ Default',
		'EQ blank',
		'Custom EQ All 0',
		'Moondrop May (EQ: No bass)',
		'Sennheiser Momentum TW5 (EQ: Neutral + Bass Boost)',
		'Qudelix QX Over (Sunrise Neutral EQ)',
		'S12 BassheadEQ',
		'illu eqharman',
		'QCU Quiet No EQ',
		'Bose QC Ultra 2 (Codec: APTX Adaptive, EQ: None, ANC: Quiet)',
		'Denon Perl Pro (EQ: Flat, ANC: On)',
		'Tanchjim Bunny DSP (EQ: Default)',
		'Sennheiser Momentum TW5 (EQ: Neutral)',
		'Samsung Galaxy Buds 3 Pro (EQ: Normal)',
		'Edifier Stax Spirit S10 (EQ: Original)',
		'Moondrop May (EQ: PEQ - no gain)',
		'Brainwavz Delta'
	])('retains genuine names and neutral EQ states: %s', (name) => {
		expect(derivedName(name)).toBeNull();
	});
	it('preserves uncertain numbered EQ presets', () => {
		expect(derivedName('Sony Linkbuds S (ANC OFF, EQ1)')).toBeNull();
		expect(derivedName('Sony Linkbuds S (ANC ON, EQ2)')).toBeNull();
	});
	it.each(['Target', '∆ difference', 'Calibration file', 'EQ Sandbox'])(
		'reports target/delta/calibration/sandbox %s',
		(name) => {
			expect(nonProductName(name)).not.toBeNull();
		}
	);
	it.each([
		['AKG', 'K371', 'headphone'],
		['AKG', 'N90Q', 'headphone'],
		['constructor', 'Model', null],
		['Audeze', 'LCD-2', 'headphone'],
		['Focal', 'Utopia', 'headphone'],
		['Hifiman', 'HE400SE', 'headphone'],
		['Beyerdynamic', 'DT770 Pro', 'headphone'],
		['Beyerdynamic', 'DT30ie', null],
		['Beyerdynamic', 'DT 70 IE', null],
		['Audeze', 'LCD-i3', null],
		['Audiosense', 'DT200', null],
		['AKG', 'K3003', null],
		['AKG', 'K319', null],
		['AKG', 'K391 NC', null],
		['AKG', 'Q350', null],
		['AKG', 'K7XX', 'headphone'],
		['AKG', 'K361BT', 'headphone'],
		['AKG', 'K1000', 'headphone'],
		['AKG', 'K2400', null],
		['Yamaha', 'TW-E3', null],
		['Goldplanar', 'GL20', null],
		['Goldplanar', 'GL12', 'iem'],
		['Sendy', 'Peacock', 'headphone'],
		['Tago Studio', 'T3-01', 'headphone'],
		['Ashidavox', 'ST-31-02', 'headphone'],
		['Moondrop', 'Joker', 'headphone'],
		['Haylou', 'S30', 'headphone'],
		['QCY', 'H3 Pro', 'headphone'],
		['Bang & Olufsen', 'Beoplay H95', 'headphone'],
		['Sennheiser', 'HD-650', 'headphone'],
		['Hifiman', 'HE-400SE', 'headphone'],
		['Audeze', 'MM100', 'headphone'],
		['Moondrop', 'Venus', 'headphone'],
		['SGOR', 'Venus', null],
		['7TH ACOUSTICS', 'RYUSEI BAROQUE', null],
		['Sony', 'WF1000-XM4', 'iem'],
		['[IEMs]', 'CrinEar Daybreak', 'iem'],
		['EPZ', 'Q5', 'iem']
	])('classifies by maker AND model, not substrings: %s %s', (brand, model, expected) => {
		expect(entryForm(phone(brand, model)).form).toBe(expected);
	});
	it('preserves named custom products without merging them into stock identity', () => {
		const custom = cleanEntry(phone('*', '*FDX-SR (JVC HA-FDX1 mod)'), source, []);
		expect(identityProblem(custom.brand, custom.name)).toBeNull();
		expect(identity(custom.brand, custom.name, 'iem', {}).id).not.toBe(
			identity('JVC', 'HA-FDX1', 'iem', {}).id
		);
		const grouped = phone('JVC', 'HA-FDX1', ['stock', 'HA-FDX1 DIY mod']);
		expect(modification(grouped, 1).name).toBe('HA-FDX1 [modified: HA-FDX1 DIY mod]');
		expect(modification(grouped, 0)).toBe(grouped);
		expect(cleanEntry(phone('[IEMs]', 'Kiwi Ears KE4'), source, ['Kiwi', 'Kiwi Ears'])).toMatchObject({
			brand: 'Kiwi Ears',
			name: 'KE4'
		});
	});
	it('does not let a non-mod suffix hide a file modification marker', () => {
		const p = phone('Maker', 'Model', ['Model Stock', 'Model Grill Mod']);
		p.suffix = ['Stock', 'foam tips'];
		expect(modification(p, 1).name).toContain('Model Grill Mod');
		expect(modification(p, 1).name).not.toBe('Model');
	});
	it.each([
		['Modhouse', 'Tungsten', 'Mod House Tungsten DS', 'stock pads'],
		['DIY', 'AE-X1D', 'DIY Dika W', 'HYX white module']
	])('does not treat the %s maker prefix as a modification marker', (brand, model, file, suffix) => {
		const p = phone(brand, model, [file, `${file} grill mod`]);
		p.suffix = [suffix, suffix];
		expect(modification(p, 0)).toBe(p);
		expect(modification(p, 1).name).toContain('[modified:');
	});
	it.each([
		['KZ', 'Unknown'],
		['Maker', ''],
		['Unknown', 'Test 2'],
		['---', '---'],
		['123', '456'],
		['Custom (fixture)', 'M'],
		['Maker', '* unresolved'],
		['Sennheiser', 'IE900 Replica'],
		['Maker', 'Counterfeit model'],
		['Sennheiser', 'IE900 Clone'],
		['Sweet Audio', 'Verite Closed Copy']
	])('quarantines unresolved identities: %s %s', (brand, model) => {
		expect(identityProblem(brand, model)).not.toBeNull();
	});
	it.each([
		['Binary', '1900'],
		['64 Audio', 'U6t'],
		['Custom (fixture)', 'klEar works Prototype'],
		['Custom (fixture)', 'GRID-SR (Final GRID01 mod)']
	])('keeps identifiable products: %s %s', (brand, model) => {
		expect(identityProblem(brand, model)).toBeNull();
	});
	it('rejects an explicitly fake file, not clone accessories on a genuine product', () => {
		expect(nonProductName('Sony MH755 Sony MH755 clone (fake)')).not.toBeNull();
		expect(nonProductName('Truthear Pure Pure AET08 (Clone AET08 Tips)')).toBeNull();
		expect(nonProductName('Focal Utopia Utopia (aftermarket clone pads)')).toBeNull();
	});
	it.each([
		['S2', 'unknown'],
		['sample 2', 'unit'],
		['(by 냥냐냥)', 'unknown'],
		['unit 2', 'unit'],
		['S2 ANC on', 'tuning'],
		['foam tips', 'fit'],
		['deep insertion', 'fit'],
		['treble tips', 'fit'],
		['switch 01', 'tuning'],
		['red filter', 'tuning'],
		['75 Ohm', 'tuning'],
		['balanced nozzle', 'tuning'],
		['balanced cable', 'setup']
	])('classifies descriptors without model-name contamination: %s', (label, kind) => {
		const p = phone('Maker', 'Bass On', ['Bass On', `Bass On ${label}`]);
		p.suffix = ['', label];
		expect(variant(p, 1, 'm-fixture').kind).toBe(kind);
	});
	it('does not call a named S2 stock model a unit, but identifies an explicitly sampled first file', () => {
		expect(variant(phone('Maker', 'S2', ['S2']), 0, 'm-a').kind).toBe('default');
		expect(variant(phone('Maker', 'Model', ['Model (sample 2)']), 0, 'm-b')).toMatchObject({
			kind: 'unit',
			isDefault: false
		});
		expect(variant(phone('Maker', 'Model', ['Model (sample 1)']), 0, 'm-c')).toMatchObject({
			kind: 'default',
			isDefault: true
		});
	});
	it('keeps genuine S-series model tokens out of descriptors despite differing maker spellings', () => {
		for (const [brand, model, file] of [
			['LETSHUOER', 'S12', 'SHUOER S12'],
			['LETSHUOER', 'S08', 'SHUOER S08'],
			['LYEPERTEK', 'S10', 'LYPERTEK S10'],
			['634 Ears', 'ROXA-S100', '634Ears ROXA-S100'],
			['Grado', 'Signature S550', 'Grado Signature S550'],
			['LETSHUOER', 'S12 2024 Edition', 'LETSHUOER S12-2024'],
			['LetShuoer', 'S12 ULTRA', 'Let S12 Ult']
		])
			expect(variant(phone(brand, model, [file ?? '']), 0, 'm-model').kind).toBe('default');
		expect(variant(phone('LETSHUOER', 'S12 PRO S2', ['SHUOER S12 PRO S2']), 0, 'm-model').kind).toBe(
			'default'
		);
	});
	it('requires source sample evidence for S2 and uses same-product S1/S2 siblings', () => {
		const p = phone('Letshuoer', 'CADENZA 12 S2', ['CADENZA 12 S2']);
		const unrelated = phone('Other', 'Model', ['Model S1']);
		expect(sampleContext([p, unrelated]).has(p)).toBe(false);
		expect(variant(p, 0, 'm-isolated').kind).toBe('default');
		const sibling = phone('Letshuoer', 'CADENZA 12 S1', ['CADENZA 12 S1']);
		expect(sampleContext([p, sibling]).has(p)).toBe(true);
		expect(variant(p, 0, 'm-paired', true).kind).toBe('unit');
		const explicit = phone('Other', 'Model', ['Model Sample 3']);
		expect(sampleContext([p, explicit]).has(p)).toBe(true);
		const unnumbered = phone('Other', 'Model', ['Model (sample)']);
		expect(sampleContext([p, unnumbered]).has(p)).toBe(true);
		expect(variant(p, 0, 'm-source', sampleContext([p, explicit]).has(p)).kind).toBe('unit');
		const within = phone('Maker', 'Model', ['Model S2', 'Model S1']);
		expect(variant(within, 0, 'm-within').kind).toBe('unit');
		expect(variant(within, 1, 'm-within1').isDefault).toBe(true);
	});
	it.each(['(by 냥냐냥)', '[measured by Sample 2]', '(measurement by Bass On)'])(
		'treats measurer credit as neutral: %s',
		(credit) => {
			const p = phone('Maker', 'Model', [`Model ${credit}`]);
			p.suffix = [credit];
			expect(variant(p, 0, 'm-credit')).toMatchObject({
				label: '',
				kind: 'default',
				isDefault: true,
				file: `Model ${credit}`
			});
			expect(sampleContext([p]).has(p)).toBe(false);
		}
	);
	it('removes credits without erasing the filename label on a later non-default measurement', () => {
		const p = phone('Maker', 'Model', ['Model (by 냥냐냥)', 'Model (by Sample 2)']);
		p.suffix = ['', ''];
		expect(variant(p, 1, 'm-later')).toMatchObject({ label: 'Model', kind: 'unknown', isDefault: false });
		expect(sampleContext([p]).has(p)).toBe(false);
	});
	it('detects duplicate shapes at quantization tolerance but retains distinct shape or coverage', () => {
		const a = Float64Array.from(RANK_GRID, (_, i) => 70 + i / 20);
		expect(
			duplicateDefault(
				a,
				Float64Array.from(a, (v) => v + 9)
			)
		).toBe(true);
		expect(
			duplicateDefault(
				a,
				Float64Array.from(a, (v, i) => v + (i % 2 ? 0.1 : -0.1))
			)
		).toBe(false);
		const missing = Float64Array.from(a);
		missing[0] = NaN;
		expect(duplicateDefault(a, missing)).toBe(false);
	});
	it('audits flat, absurd, out-of-range and unsupported curves without rejecting a flat calibrated result', () => {
		expect(curveProblem(new Float64Array(240).fill(80), false)).toBe('flat line');
		expect(curveProblem(new Float64Array(240).fill(80), true)).toBeNull();
		expect(curveProblem([0, 101], false)).toBe('absurd dynamic range');
		expect(curveProblem(new Float64Array(240).fill(201), true)).toBe('invalid calibrated range');
		expect(curveProblem([70, 71], true)).toBe('invalid calibrated range');
	});
	it('isolates both unknown hardware and reclassified headphones while preserving known 5128 family', () => {
		expect(partitionFor(source, 'iem')).toBe('iem-source-fixture');
		expect(partitionFor(source, 'headphone')).toBe('headphone-source-fixture');
		expect(partitionFor(sourceFor({ ...db, dbType: '5128' }, '', 'date', {}), 'headphone')).toBe(
			'headphone-5128'
		);
	});
});
