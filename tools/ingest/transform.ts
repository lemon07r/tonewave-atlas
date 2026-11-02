import type { Database, Phone } from './common.ts';
import { configString, formFor, nonProductName, productAliasKey, record, sha256 } from './common.ts';
import type { Form, Product, Source, Variant } from '#core/dataset/types.ts';
import { classifyEq, factoryMode } from './eq.ts';
import { adapterState, cableDescriptor, tipDescriptor, tuningDescriptor } from './variant-labels.ts';

export function normalise(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]/gu, '');
}

export function identity(
	brand: string,
	model: string,
	form: Form,
	aliases: Record<string, string>,
	productAliases: Record<string, string> = {}
): {
	id: string;
	brand: string;
	model: string;
	key: string;
	originalKey: string;
	observedBrand: string;
	observedModel: string;
} {
	let canonical = aliases[normalise(brand)] ?? brand.trim().replace(/\s+/g, ' ');
	let cleanModel = model.trim().replace(/\s+/g, ' ');
	const originalKey = `${form}:${normalise(canonical)}:${normalise(cleanModel)}`;
	// Use identity's spelling normalization, but only at complete leading-word boundaries.
	const prefixes = new Set([normalise(brand), normalise(canonical)].filter(Boolean));
	for (;;) {
		let rest: string | undefined;
		for (const boundary of cleanModel.matchAll(/\s+/g)) {
			if (prefixes.has(normalise(cleanModel.slice(0, boundary.index))))
				rest = cleanModel.slice(boundary.index + boundary[0].length);
		}
		if (!rest) break;
		cleanModel = rest;
	}
	const observedBrand = brand.trim().replace(/\s+/g, ' ');
	const observedModel = cleanModel;
	const alias = productAliases[productAliasKey(canonical, cleanModel)];
	if (alias) {
		const [targetBrand = '', targetModel = ''] = alias.split('|');
		canonical = aliases[normalise(targetBrand)] ?? targetBrand.trim().replace(/\s+/g, ' ');
		cleanModel = targetModel.trim().replace(/\s+/g, ' ');
	}
	const key = `${form}:${normalise(canonical)}:${normalise(cleanModel)}`;
	return {
		id: `p-${sha256(key).slice(0, 20)}`,
		brand: canonical,
		model: cleanModel,
		key,
		originalKey,
		observedBrand,
		observedModel
	};
}

/** Labels only: one vote per accepted measurement, never alias-table casing. */
export class DisplayNames {
	brands = new Map<string, Map<string, number>>();
	models = new Map<string, Map<string, number>>();

	observe(product: ReturnType<typeof identity>): void {
		for (const [votes, key, spelling] of [
			[this.brands, normalise(product.brand), product.observedBrand],
			[this.models, product.id, product.observedModel]
		] as const) {
			const counts = votes.get(key) ?? new Map<string, number>();
			counts.set(spelling, (counts.get(spelling) ?? 0) + 1);
			votes.set(key, counts);
		}
	}

	apply(products: Iterable<Pick<Product, 'id' | 'brand' | 'model'>>): void {
		const preferred = (counts: Map<string, number> | undefined): string => {
			const mixed = (value: string) => /\p{Lu}/u.test(value) && /\p{Ll}/u.test(value);
			const spelling = [...(counts ?? [])].sort(
				([a, n], [b, m]) => m - n || Number(mixed(b)) - Number(mixed(a)) || (a < b ? -1 : a > b ? 1 : 0)
			)[0]?.[0];
			if (spelling === undefined) throw new Error('Missing source-observed display spelling');
			return spelling;
		};
		for (const product of products) {
			product.brand = preferred(this.brands.get(normalise(product.brand)));
			product.model = preferred(this.models.get(product.id));
		}
	}
}

/** Credits identify the measurer, not a sample, fit, or voicing. Original filenames stay intact. */
export function withoutAttribution(text: string): string {
	return text.replace(/[([]\s*(?:(?:measured|measurement|measurements)\s+)?by\s+[^)\]]+[)\]]/gi, '').trim();
}

/** S<n> is a sample shorthand only with explicit source evidence or sibling sample numbers. */
export function sampleContext(phones: readonly Phone[]): ReadonlySet<Phone> {
	const text = (p: Phone) => [p.name, ...p.file, ...p.suffix].map(withoutAttribution).join(' ');
	const explicit = phones.some((p) => /\b(?:sample|unit)\s*[:#-]?\s*\d+\b/i.test(text(p)));
	const key = (p: Phone) => `${normalise(p.brand)}:${normalise(p.name.replace(/\bs[1-9]\b/gi, ''))}`;
	const groups = Map.groupBy(phones, key);
	return new Set(
		phones.filter((p) => {
			const siblings = groups.get(key(p)) ?? [];
			const numbers = new Set(
				siblings.flatMap((q) => [...text(q).matchAll(/\bs([1-9])\b/gi)].map((m) => m[1]))
			);
			return explicit || numbers.size > 1;
		})
	);
}

function descriptor(phone: Phone, index: number): string {
	const file = phone.file[index] ?? '';
	// Descriptors, not the product's own name: e.g. a sample of Tangzu ON must not become tuning.
	let firstDescriptor = file;
	for (const prefix of [`${phone.brand} ${phone.name}`, phone.name]) {
		if (
			firstDescriptor.toLowerCase().startsWith(prefix.toLowerCase()) &&
			!/[\p{L}\p{N}]/u.test(firstDescriptor[prefix.length] ?? '')
		) {
			firstDescriptor = firstDescriptor.slice(prefix.length);
			break;
		}
	}
	const modelPattern = new RegExp(
		`(?<![\\p{L}\\p{N}])${phone.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`,
		'iu'
	);
	return withoutAttribution(
		(
			phone.suffix[index]?.trim() ||
			(index === 0 ? firstDescriptor : file.slice(commonPrefix(phone.file[0] ?? '', file)))
		).replace(modelPattern, '')
	);
}

function sampleDescriptor(phone: Phone, index: number, shortSamples: boolean): string {
	// B&W's Pi7/Px7/Px8 S2/S3 labels denote product generations, not replacement samples.
	const name = phone.name.replace(/\b(?:Pi7|Px[78])\s+S[23]\b|^s\d+$/gi, '');
	const text = `${descriptor(phone, index)} ${
		withoutAttribution(name)
			.match(/\b(?:sample|unit)\s*[:#-]?\s*\d+|\bs[1-9]\b|\bprototype\b/gi)
			?.join(' ') ?? ''
	}`;
	return shortSamples ? text : text.replace(/\bs[1-9]\b/gi, '');
}

const unitPattern = /\b(?:sample|unit)\s*[:#-]?\s*\d+\b|\bs[1-9]\b|\bprototype\b|\bdefect/i;
const withoutSampleOne = (text: string): string =>
	text.replace(/\b(?:sample|unit)\s*[:#-]?\s*1\b|\bs1\b/gi, '');

function eqLabel(phone: Phone, index: number): string {
	return withoutAttribution(
		`${phone.brand} ${phone.name} ${phone.file[index] ?? ''} ${phone.suffix[index] ?? ''}`
	);
}

/** Explicit stock/neutral states win, then ANC off; source order breaks ties and supplies the fallback. */
export function defaultVariantIndex(
	phone: Phone,
	shortSamples = sampleContext([phone]).has(phone)
): number | null {
	const candidates = phone.file.flatMap((_file, index) => {
		const text = descriptor(phone, index);
		const eq = classifyEq(eqLabel(phone, index));
		if (
			eq === 'ambiguous' ||
			nonProductName(eqLabel(phone, index)) ||
			adapterState(`${phone.file[index] ?? ''} ${text}`) !== null ||
			unitPattern.test(withoutSampleOne(sampleDescriptor(phone, index, shortSamples)))
		)
			return [];
		// A stock accessory does not identify the product's stock electronic/voicing mode.
		const state = text.replace(
			/\b(?:stock|default|normal|standard|original)\b[^();,]*\b(?:tips?|eartips?|pads?|cable)\b/gi,
			''
		);
		const score =
			Number(/\b(?:default|stock)\b/i.test(state)) * 100 +
			Number(eq === 'neutral' && !/\bn\/a\b/i.test(text)) * 50 +
			Number(/\b(?:normal|norm|standard|original)\b/i.test(state)) * 30 +
			Number(/\b(?:anc\s*[:=-]?\s*off|noanc)\b|\(off\s*[-)]/i.test(text)) * 10;
		return [{ index, score }];
	});
	return candidates.sort((a, b) => b.score - a.score || a.index - b.index)[0]?.index ?? null;
}

export function variant(
	phone: Phone,
	index: number,
	measurementId: string,
	shortSamples = sampleContext([phone]).has(phone)
): Variant {
	const file = phone.file[index] ?? '';
	const label = withoutAttribution(phone.suffix[index] ?? (index === 0 ? '' : file));
	const text = sampleDescriptor(phone, index, shortSamples);
	const eq = classifyEq(eqLabel(phone, index));
	const preferred = defaultVariantIndex(phone, shortSamples);
	const unitText = index === 0 || index === preferred ? withoutSampleOne(text) : text;
	const kind =
		eq === 'ambiguous'
			? 'tuning'
			: unitPattern.test(unitText)
				? 'unit'
				: index === preferred
					? 'default'
					: eq !== 'none' || /\bdsp\s*:/i.test(text) || tuningDescriptor(text)
						? 'tuning'
						: tipDescriptor(text)
							? 'fit'
							: (factoryMode(text) && !/\b(?:balanced|single.ended)\s+(?:cable|adapter)\b/i.test(text)) ||
								  /switch|nozzle|impedance|\bohm|\bdsp\b|filter|bass|treble|\banc\b|transparent|\bon\b|\boff\b|m20|m15|m12|\bmx\b/i.test(
										text
								  )
								? 'tuning'
								: cableDescriptor(text) || /adapter|dongle|cable|\bamp\b|balanced|single.ended/i.test(text)
									? 'setup'
									: /sample|unit|proto|defect/i.test(text)
										? 'unit'
										: 'unknown';
	return { id: `v-${measurementId.slice(2)}`, file, label, kind, isDefault: kind === 'default' };
}

function commonPrefix(a: string, b: string): number {
	if (a === b) return 0;
	let i = 0;
	while (i < a.length && a[i]?.toLowerCase() === b[i]?.toLowerCase()) i++;
	while (i > 0 && i < a.length && /[\p{L}\p{N}]/u.test(b[i - 1] ?? '')) i--;
	return i;
}

/** Dollar sign alone follows the source index's USD convention; no bare numbers or conversions. */
export function usdPrice(raw: string): number | null {
	const match =
		/^(?:US\s*\$|USD\s*\$?|\$)\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(?:\s*USD)?$/i.exec(raw.trim()) ??
		/^(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s*USD$/i.exec(raw.trim());
	if (!match) return null;
	const value = Number((match[1] ?? '').replaceAll(',', '') + (match[2] ?? ''));
	return Number.isFinite(value) && value >= 0 ? value : null;
}

export function sourceFor(db: Database, config: string, crawledAt: string, override: unknown): Source {
	const o = record(override) ? override : {};
	const form = o.form === 'iem' || o.form === 'headphone' ? o.form : formFor(db);
	const rig = typeof o.rig === 'string' ? o.rig : configString(config, 'rig_description');
	const family =
		db.dbType === '5128' ||
		/5128/.test(rig ?? '') ||
		(typeof o.partition === 'string' && /-5128$/.test(o.partition))
			? '5128'
			: /\b(?:711|60711)\b|60318[\s-]*4/i.test(rig ?? '') || o.partition === 'iem-711'
				? '711'
				: null;
	let partition: string;
	if (typeof o.partition === 'string') partition = o.partition;
	else if (db.dbType === '5128' || /5128/.test(rig ?? '')) partition = `${form}-5128`;
	else if (form === 'iem') partition = family === '711' ? 'iem-711' : `iem-source-${db.id}`;
	else if (/mini.?dsp\s+ears\s+pro/i.test(rig ?? '')) partition = 'headphone-minidsp-ears-pro';
	else if (/mini.?dsp\s+ears/i.test(rig ?? '')) partition = 'headphone-minidsp-ears';
	else if (/\b4128\b/.test(rig ?? '')) partition = 'headphone-4128';
	else partition = `headphone-source-${db.id}`;
	if (!/^[a-z0-9-]+$/.test(partition)) throw new Error(`Unsafe partition id ${partition}`);
	return {
		...db,
		form,
		partition,
		rig: rig || null,
		rigEvidence: {
			configRig: configString(config, 'rig_description'),
			class: family || (form === 'headphone' && rig) ? 'verified' : 'unknown',
			family,
			rationale:
				typeof o.rationale === 'string'
					? o.rationale
					: db.dbType === '5128'
						? 'squigsites.json database type 5128'
						: family
							? `config rig_description: ${rig}`
							: 'No recognised IEM rig family in config or curated override'
		},
		rigInferred: !family && !(form === 'headphone' && rig),
		permission:
			o.permission === 'permission granted' ? 'permission granted' : 'public, not explicitly licensed',
		crawledAt,
		calibration: configString(config, 'measurement_calibration_file')
	};
}

interface AuditProduct {
	id: string;
	brand: string;
	model: string;
	form?: Form;
}

/** Connected near-name candidates for human audit only; never used to assign product identity. */
export function collisionGroups(products: AuditProduct[]): string[][] {
	const parent = new Map<string, string>(),
		size = new Map<string, number>();
	const find = (id: string): string => {
		if (!parent.has(id)) parent.set(id, id);
		let root = id;
		while (parent.get(root) !== root) root = parent.get(root) ?? root;
		while (id !== root) {
			const next = parent.get(id) ?? root;
			parent.set(id, root);
			id = next;
		}
		return root;
	};
	for (const { left, right } of suspiciousNames(products)) {
		let a = find(left),
			b = find(right);
		if (a === b) continue;
		if ((size.get(a) ?? 1) < (size.get(b) ?? 1)) [a, b] = [b, a];
		parent.set(b, a);
		size.set(a, (size.get(a) ?? 1) + (size.get(b) ?? 1));
	}
	const groups = new Map<string, Set<string>>();
	for (const id of parent.keys()) {
		const root = find(id),
			members = groups.get(root) ?? new Set<string>();
		members.add(id);
		groups.set(root, members);
	}
	const names = new Map(products.map((p) => [p.id, `${p.form ? `[${p.form}] ` : ''}${p.brand} ${p.model}`]));
	return [...groups.values()]
		.map((ids) => [...ids].map((id) => names.get(id) ?? id).sort())
		.sort((a, b) => b.length - a.length || (a[0] ?? '').localeCompare(b[0] ?? '', 'en'));
}

/** Edit-distance candidates are audit suggestions ONLY; no fuzzy identity merges. */
export function suspiciousNames(products: AuditProduct[]): { left: string; right: string }[] {
	const groups = new Map<string, typeof products>();
	for (const p of products) {
		const key = `${p.form ?? 'unknown'}:${normalise(p.brand)}`;
		const group = groups.get(key) ?? [];
		group.push(p);
		groups.set(key, group);
	}
	const out: { left: string; right: string }[] = [];
	for (const group of groups.values()) {
		group.sort((a, b) => normalise(a.model).localeCompare(normalise(b.model), 'en'));
		for (let i = 1; i < group.length; i++) {
			const left = group[i - 1];
			const right = group[i];
			if (!left || !right) continue;
			const a = normalise(left.model),
				b = normalise(right.model);
			if (Math.min(a.length, b.length) < 6 || Math.abs(a.length - b.length) > 2) continue;
			let row = Array.from({ length: b.length + 1 }, (_, j) => j);
			for (let k = 0; k < a.length; k++) {
				const next = [k + 1];
				for (let j = 0; j < b.length; j++)
					next.push(
						Math.min((next[j] ?? 0) + 1, (row[j + 1] ?? 0) + 1, (row[j] ?? 0) + Number(a[k] !== b[j]))
					);
				row = next;
			}
			if ((row.at(-1) ?? Infinity) <= 2) out.push({ left: left.id, right: right.id });
		}
	}
	return out;
}
