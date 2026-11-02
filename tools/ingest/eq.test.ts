import { describe, expect, it } from 'vitest';
import type { Phone } from './common.ts';
import { nonProductName } from './common.ts';
import { classifyEq } from './eq.ts';
import { defaultVariantIndex, variant } from './transform.ts';

const phone = (name: string, file: string[], suffix: string[] = []): Phone => ({
	brand: 'Fixture',
	name,
	file,
	suffix,
	price: null,
	reviewLink: null
});

describe('real source EQ labels', () => {
	// Exact cached filename/suffix pairs: the suffix, not the abbreviated filename, triggered the bug.
	it.each([
		['CMF Buds Pro', '(Codec: AAC, EQ: Balanced, ANC: High)'],
		['Beats PBP2 Norm', '(Codec: AAC, EQ: N/A, ANC: Off)'],
		['Pi7S2 ANCOff', '(Codec: APTX Adaptive, EQ: N/A, ANC: Off)'],
		['Pi7S2 ANCOn', '(Codec: APTX Adaptive, EQ: N/A, ANC: On)'],
		['MDST2 Ref-ANC', '(Codec: AAC, EQ: Reference, ANC: On)'],
		['1More ComfMini Norm', '(Codec: AAC, EQ: N/A, ANC: Off)'],
		['NeoBudsPro2 ANCOff', '(Codec: LDAC, EQ: Classic, ANC: Off)'],
		['EdStaxS10 ElStatic ANC', '(Codec: LDAC, EQ: Electrostatic, ANC: Strong)'],
		['OPB4 Norm Bal', '(Codec: LHDC v5, EQ: Balanced, ANC: Off)'],
		['Moondrop SpacTrav Bas', '(EQ: Basshead)'],
		['Moondrop Moca Mon', '(EQ: Monitor)'],
		['Moondrop May Harman', '(EQ: Harman)'],
		['Tanchjim Origin LM SDpo', '(filter: S ; jack: DSP ; EQ: Popular)'],
		['Moondrop Ultrasonic 336xx', '(EQ: 336xx)'],
		['Samsung Galaxy Buds2 Pro (bass boost)', '(eq: bass boost)'],
		['Soundpeats H3 HiFi', '(HiFI EQ)'],
		['Soundpeats H3 Rock Roll', '(Rock Roll EQ)'],
		['Google Pixel Buds Pro (ANC - Balanced EQ)', ''],
		['Samsung Galaxy Buds FE (ANC - Dynamic EQ)', ''],
		['Qudelix QX Over (Sunrise Neutral EQ)', ''],
		['Bose QC Ultra + HiFi EQ', ''],
		['Bose QC Ultra + Classic EQ', ''],
		['Moondrop Kadenz (Echo-B Bass+ EQ - nozzle B - spring tips)', ''],
		['Moondrop Kadenz (Echo-B Bass++ EQ - nozzle B - spring tips)', ''],
		['Moondrop Kadenz (Echo-B Sound stage+ EQ - nozzle B - spring tips)', ''],
		['Technics EAH-AZ80 (ANC - Super Bass+ EQ)', ''],
		['Samsung Galaxy Buds2 Pro (ANC off)', '(eq: normal + ANC off)']
	])('keeps %s and makes the alternative a non-default tuning', (file, suffix) => {
		expect(nonProductName(`${file} ${suffix}`)).toBeNull();
		const p = phone('Model', ['Model (default)', file], ['(default)', suffix]);
		expect(variant(p, 1, 'm-real')).toMatchObject({ kind: 'tuning', isDefault: false });
	});
	it.each([
		'IE900 + EQ (5128 DF)',
		'EQed AKG N400',
		"AKG N400 EQ'd",
		'Moondrop May (User EQ)',
		'FreeBuds Pro 4 (ANC Ultra, EQ custom)',
		'Qudelix QX Over (Oratory1990 EQ)',
		'Sennheiser IE400 Pro (sample 2 - h0llow Manual EQ)',
		'Singer (ANС ON, EQ HD580P)',
		'ZEN Hybrid Pro Classic (EQ to Harman, ANC=ON)',
		'Final E500 AutoEQ',
		'Soundpeats H3 TDM PEQ CURVE FINAL',
		'WH-1000XM3 with EQ',
		'Buds 3 Pro (ANC ON, EQ custom -3-125-6-6)',
		'Blackshark V2 (2023) (EQ -5-5-5-3+5+3+3+2-4-5)',
		'Galaxy Buds 3 Pro (noANC, EQ 00-1+1+2+20-4-5, stock silicone tips)',
		'QuietComfort SE (EQ -2 +3 -3)',
		'volume s k7 max values K7 EQ Max Values (+12 Bass, +6 Treble)',
		'volume s k7 min values K7 EQ Min Values (-12 Bass, -6 Treble)'
	])('excludes explicit post-hoc settings: %s', (text) => {
		expect(classifyEq(text)).toBe('post-hoc');
		expect(nonProductName(text)).toBe('derived EQ curve');
	});
	it.each([
		'Moondrop Rays PEQ0 (EQ: PEQ 0 Gain)',
		'Moondrop May (EQ: PEQ - no gain)',
		'Tanchjim Bunny G PEQ0 EQ: 0dB PEQ',
		'950NB (ANC ON, EQ Custom (0 gain))',
		'QCY Melobuds N70 NoEq Custom EQ all set to zero',
		'Custom EQ All 0',
		'Dyson OnTrac (ANC - User EQ ALL 0 - LHDC)',
		'One DSP PEQ OFF 5 Band PEQ Off',
		'Tanchjim Ola II DSP 0db (EQ: PEQ 0dB gain)'
	])('keeps explicitly zero-gain slots: %s', (text) => {
		expect(classifyEq(text)).toBe('neutral');
		expect(nonProductName(text)).toBeNull();
	});
	it.each(['EQ1', 'EQ2', 'Sunrise Neutral EQ', 'Southbird EQ 3', 'EQ unidentified preset'])(
		'never defaults an uncertain label: %s',
		(label) => {
			const p = phone('Model', [`Model (${label})`]);
			expect(classifyEq(label)).toBe('ambiguous');
			expect(defaultVariantIndex(p)).toBeNull();
			expect(variant(p, 0, 'm-uncertain')).toMatchObject({ kind: 'tuning', isDefault: false });
		}
	);
	it('does not treat an unqualified k7 max values label as a user EQ setting', () => {
		expect(nonProductName('volume s k7 max values')).toBeNull();
	});
	it('does not mistake the plus in the Air Pro 4+ model for a post-hoc operation', () => {
		const p = phone('Air Pro 4+', ['Earfun Air Pro 4+', 'Earfun Air Pro 4+ EQ']);
		expect(nonProductName('Earfun Air Pro 4+ Earfun Air Pro 4+ EQ')).toBeNull();
		expect(variant(p, 1, 'm-earfun')).toMatchObject({ kind: 'tuning', isDefault: false });
	});
	it('uses EQ labels in the product name consistently with the builder audit', () => {
		const p = phone('Key Pro EQ Variation', ['Key Pro Nostal', 'Key Pro Jazz']);
		expect(defaultVariantIndex(p)).toBeNull();
		for (const i of [0, 1])
			expect(variant(p, i, 'm-key')).toMatchObject({ kind: 'tuning', isDefault: false });
	});
	it('does not promote stock accessories or replacement units over the original default', () => {
		for (const suffix of [
			'(Stock Clear Ear Tips)',
			'(Stock Original Pads)',
			'(Sample 2) (ANC off)',
			'S2 (EQ: Default)'
		]) {
			const p = phone('Model', ['Model', `Model ${suffix}`], ['', suffix]);
			expect(defaultVariantIndex(p)).toBe(0);
			expect(variant(p, 0, 'm-original').isDefault).toBe(true);
			expect(variant(p, 1, 'm-alt').isDefault).toBe(false);
		}
	});
	it('allows explicitly selected sample 1 stock DSP at a later index', () => {
		const p = phone(
			'DUSK',
			['DUSK (Analog)', 'DUSK (Stock DSP)'],
			['(Sample 1) (Analog)', '(Sample 1) DSP (Stock)']
		);
		expect(defaultVariantIndex(p)).toBe(1);
		expect(variant(p, 1, 'm-stock')).toMatchObject({ kind: 'default', isDefault: true });
	});
	it('preserves B&W generation labels while recognizing explicit replacement units', () => {
		for (const model of ['Pi7 S2', 'Px7 S3', 'Px8 S2']) {
			const p = phone(model, [`${model} ANC on`, `${model} ANC off`], ['(ANC On)', '(ANC Off)']);
			expect(variant(p, 1, 'm-gen').kind).toBe('default');
		}
	});
	it('recognizes the named H3 Book Whisper factory mode without an EQ token', () => {
		const p = phone(
			'H3',
			['Soundpeats H3 HiFi', 'Soundpeats H3 Book Whisper'],
			['(HiFI EQ)', '(Book Whisper)']
		);
		expect(variant(p, 1, 'm-book')).toMatchObject({ kind: 'tuning', isDefault: false });
	});
	it('keeps an explicit factory DSP preset ahead of incidental stock-tip metadata', () => {
		const p = phone(
			'May',
			['Moondrop May Standard', 'Moondrop May Harman'],
			['(DSP: Standard) (Coupler 8kHz) (Stock Tips)', '(DSP: Harman) (Coupler 8kHz) (Stock Tips)']
		);
		expect(variant(p, 1, 'm-dsp-harman')).toMatchObject({ kind: 'tuning', isDefault: false });
		const orca = phone('Orca', ['TRN Orca Standard Mode', 'TRN Orca Equalization Mode']);
		expect(nonProductName('TRN Orca Equalization Mode')).toBeNull();
		expect(variant(orca, 1, 'm-orca')).toMatchObject({ kind: 'tuning', isDefault: false });
	});
	it('prefers an explicit ANC-off neutral state even when it is not first', () => {
		const p = phone(
			'Pi7 S2',
			['Pi7S2 ANCOn', 'Pi7S2 ANCOff'],
			['(Codec: APTX Adaptive, EQ: N/A, ANC: On)', '(Codec: APTX Adaptive, EQ: N/A, ANC: Off)']
		);
		expect(defaultVariantIndex(p)).toBe(1);
		expect(variant(p, 0, 'm-on').kind).toBe('tuning');
		expect(variant(p, 1, 'm-off').isDefault).toBe(true);
		const samsung = phone(
			'Galaxy Buds2 Pro',
			['Samsung Galaxy Buds2 Pro (normal)', 'Samsung Galaxy Buds2 Pro (ANC off)'],
			['(eq: normal)', '(eq: normal + ANC off)']
		);
		expect(classifyEq('(eq: normal + ANC off)')).toBe('neutral');
		expect(defaultVariantIndex(samsung)).toBe(1);
	});
	it('uses explicit stock modes before source-order fallback, including mode-only products', () => {
		const p = phone(
			'May',
			['Moondrop May Harman', 'Moondrop May Standard', 'Moondrop May Basshead'],
			['(EQ: Harman)', '(EQ: Standard)', '(EQ: Basshead)']
		);
		expect(defaultVariantIndex(p)).toBe(1);
		expect(variant(p, 0, 'm-harman').kind).toBe('tuning');
		const only = phone('CMF Buds Pro', ['CMF Buds Pro'], ['(Codec: AAC, EQ: Balanced, ANC: High)']);
		expect(variant(only, 0, 'm-only')).toMatchObject({ kind: 'default', isDefault: true });
	});
});
