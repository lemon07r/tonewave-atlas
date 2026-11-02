import { responseDistance } from '#core/analysis/distance.ts';
import { RANK_GRID } from '#core/grid.ts';
import type { Form, Source } from '#core/dataset/types.ts';
import type { Phone } from './common.ts';
import { normalise } from './transform.ts';

/** Audited maker/model families. Anchored to BOTH maker and model, never fuzzy identity merges. */
const headphoneModels: Record<string, RegExp> = {
	// Established full-size models in the indexes; K319/K391/Q350 are not headphones.
	akg: /^(?:K\s*(?:52|72|92|140|182|240|245|267|271|275|290|340|361|371|400|402|501|553|612|701|702|712|7XX|812|872|1000)(?!\d)|Q701(?!\d)|N9\b|N700NC\b)/i,
	audeze: /^(?:LCD(?![- ]?i[34])|MM[- ]?\d|EL[- ]|Maxwell|Mobius|Penrose)/i,
	audiotechnica: /^ATH[- ]?(?:AD|A\d|AV|M\d|W|R\d)/i,
	beyerdynamic: /^DT\s*\d+(?!.*\bie\b)/i,
	fiio: /^(?:FT|JT|EH)\d/i,
	focal: /^(?:Azurys|Clear|Hadenys|Stellia|Utopia|Elegia|Elear|Bathys)/i,
	hifiman: /^(?:HE[- ]?\d|Arya|Ananda|Edition|Sundara|Susvara|Deva|Mini Shangri|Shangri)/i,
	moondrop: /^(?:Cosmo|Para|Venus|Laputa|Edge|Horizon|Joker)\b/i,
	sennheiser: /^(?:HD[- ]?\d|HDB[- ]?\d|HE[- ]?\d|PC\d|PXC\d)/i,
	sony: /^MDR[- ]?(?:M1|MV1|7506|H600|Z1R|Z7)|^WH[- ]?\d/i,
	phillips: /^Fidelio X/i,
	philips: /^Fidelio X/i,
	final: /^DX\d/i,
	finalaudio: /^DX\d/i,
	aune: /^SR\d/i,
	shanling: /^HW\d/i,
	kiwiears: /^(?:Atheia|Aventus|Ellipse)\b/i,
	fosiaudio: /^i5\b/i,
	thieaudio: /^(?:Cypher|Ghost)\b/i,
	edifier: /^(?:WH|W820)/i,
	blon: /^B60\b/i,
	nothing: /^Headphone\b/i,
	yamaha: /^(?:YH|HP|RH)[- ]?\d/i,
	goldplanar: /^GL[- ]?(?:1000|1200|2000|600|850)\b/i,
	fifine: /^(?:H[369]|AmpliGame\s+H[369])\b/i,
	sendy: /^Peacock\b/i,
	ashidavox: /^ST[- ]31[- ]02\b/i,
	tagostudio: /^T3[- ]0[13]\b/i,
	haylou: /^S30\b/i,
	qcy: /^H3\s+Pro\b/i,
	bangolufsen: /^Beoplay\s+H95\b/i
};
const headphoneMakers = new Set([
	'auribusacoustics',
	'austrianaudio',
	'capraaudio',
	'danclarkaudio',
	'danclark',
	'dca',
	'harmonicdyne',
	'neumann',
	'philphone',
	'zmf'
]);
const iemMakers = new Set([
	'7hz',
	'aful',
	'7herz',
	'binary',
	'binaryacoustics',
	'cca',
	'cozoy',
	'epz',
	'etymotic',
	'kz',
	'letshuoer',
	'letshouer',
	'simgot',
	'tin',
	'tinhifi',
	'truthear'
]);

export function entryForm(phone: Phone): { form: Form | null; reason: string | null } {
	if (/^\[iems?\]$/i.test(phone.brand.trim()))
		return { form: 'iem', reason: 'explicit source-index [IEMs] category' };
	const brand = normalise(phone.brand);
	const model = phone.name.replace(
		new RegExp(`^${phone.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i'),
		''
	);
	if (
		headphoneMakers.has(brand) ||
		(headphoneModels[brand]?.test(model) && !(brand === 'beyerdynamic' && /\d\s*ie\b/i.test(model)))
	)
		return { form: 'headphone', reason: 'audited maker/model headphone family' };
	if (
		iemMakers.has(brand) ||
		(brand === 'sony' && /^WF[- ]?\d/i.test(model)) ||
		(['final', 'finalaudio'].includes(brand) && /^E\d/i.test(model)) ||
		(brand === 'dunu' && /^Titan\b/i.test(model)) ||
		(brand === 'kiwi' && /^KE4\b/i.test(model)) ||
		(brand === 'meze' && /^(?:Alba|Advar|Rai)\b/i.test(model)) ||
		(brand === 'moondrop' && /^(?:Aria|Blessing|Chu|Kato|Kadenz|Variations|Space Travel)\b/i.test(model)) ||
		(brand === 'haylou' && /Moripods/i.test(model)) ||
		(brand === 'goldplanar' && /^GL[- ]?12\b/i.test(model))
	)
		return { form: 'iem', reason: 'audited maker/model IEM family' };
	return { form: null, reason: null };
}

/** Category markers are not makers. Named custom products keep the COMPLETE distinct model. */
export function cleanEntry(phone: Phone, source: Source, knownBrands: string[]): Phone {
	if (/^\*(?:MOD|MISC)?$/i.test(phone.brand.trim()))
		return { ...phone, brand: `Custom (${source.username})`, name: phone.name.replace(/^\*+\s*/, '') };
	if (/^\[(?:IEMs?|Unbranded)\]$/i.test(phone.brand.trim())) {
		const prefix = [...knownBrands]
			.filter((b) => b.trim() && !/^\W/.test(b))
			.sort((a, b) => b.length - a.length)
			.find((b) => phone.name.toLowerCase().startsWith(`${b.toLowerCase()} `));
		return {
			...phone,
			brand: prefix ?? `Unbranded (${source.username})`,
			name: prefix ? phone.name.slice(prefix.length).trim() : phone.name
		};
	}
	return phone;
}

export function identityProblem(brand: string, model: string): string | null {
	const placeholder = /^(?:unknown|undefined|null|none|n\/?a|untitled|tbd|test|[-?_.\s]*)$/i;
	if (!model.trim() || placeholder.test(model.trim())) return 'blank/placeholder model';
	if (!brand.trim() || placeholder.test(brand.trim())) return 'blank/placeholder brand';
	if (!/\p{L}/u.test(`${brand} ${model}`)) return 'identity contains only symbols/digits';
	if (/^Custom\b/.test(brand) && /^[\p{L}\p{N}]$/u.test(model))
		return 'unidentified one-character custom product';
	if (/\b(?:fake|replica|counterfeit|clone|copy)\b/i.test(`${brand} ${model}`))
		return 'explicit fake/replica/counterfeit/clone/copy product';
	if (/^\s*[*_=!?]|^\s*[-–—]{2,}/.test(brand) || /^\s*[*_=!?]/.test(model))
		return 'unresolved leading identity marker';
	return null;
}

/** Do not collapse separately labelled fits, samples or tunings, even when their curves coincide. */
export function duplicateDefault(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
	if (Array.from(a).some((v, i) => Number.isFinite(v) !== Number.isFinite(b[i] ?? NaN))) return false;
	const d = responseDistance(a, b, { frequencies: RANK_GRID });
	return (
		!!d &&
		d.distance <= 0.01 &&
		Array.from(a).every((v, i) => !Number.isFinite(v) || Math.abs(v - (b[i] ?? NaN) - d.offset) <= 0.02)
	);
}

export function partitionFor(source: Source, form: Form): string {
	if (source.form === form && !/^(?:iem|headphone)-(?:source-|711$|5128$)/.test(source.partition))
		return source.partition;
	if (source.rigEvidence?.family === '5128') return `${form}-5128`;
	if (form === 'iem') return source.rigEvidence?.family === '711' ? 'iem-711' : `iem-source-${source.id}`;
	return source.form === form ? source.partition : `headphone-source-${source.id}`;
}

/** Keep an explicitly modified file out of the stock identity, even if its index groups them together. */
export function modification(phone: Phone, index: number): Phone {
	const marker = /\b(?:mod(?:ded|ification)?|DIY|prototype|reshell)\b/i;
	if (marker.test(phone.name)) return phone;
	const descriptor = phone.suffix[index] || phone.file[index] || '';
	return marker.test(descriptor) ? { ...phone, name: `${phone.name} [modified: ${descriptor}]` } : phone;
}

/** Preserve the pre-existing range gates and avoid spreading dense raw files into call arguments. */
export function curveProblem(values: ArrayLike<number>, calibrated: boolean): string | null {
	let low = Infinity,
		high = -Infinity,
		finite = 0;
	for (let i = 0; i < values.length; i++) {
		const value = values[i] ?? NaN;
		if (!Number.isFinite(value)) continue;
		finite++;
		low = Math.min(low, value);
		high = Math.max(high, value);
	}
	if (high - low > 100) return 'absurd dynamic range';
	if (!calibrated && high - low < 0.05) return 'flat line';
	if (calibrated && (finite < 16 || low < -200 || high > 200)) return 'invalid calibrated range';
	return null;
}
