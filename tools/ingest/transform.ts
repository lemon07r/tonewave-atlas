import type { Database, Phone } from './common.ts';
import { configString, formFor, record, sha256 } from './common.ts';
import type { Form, Source, Variant } from '#core/dataset/types.ts';

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
	aliases: Record<string, string>
): { id: string; brand: string; model: string; key: string } {
	const canonical = aliases[normalise(brand)] ?? brand.trim().replace(/\s+/g, ' ');
	const cleanModel = model.trim().replace(/\s+/g, ' ');
	const key = `${form}:${normalise(canonical)}:${normalise(cleanModel)}`;
	return { id: `p-${sha256(key).slice(0, 20)}`, brand: canonical, model: cleanModel, key };
}

export function variant(phone: Phone, index: number, measurementId: string): Variant {
	const file = phone.file[index] ?? '';
	const label = phone.suffix[index] ?? (index === 0 ? '' : file);
	const text = `${label} ${file}`;
	const kind =
		index === 0
			? 'default'
			: /switch|nozzle|impedance|\bohm|\bdsp\b|filter|bass|treble|\banc\b|transparent|\bon\b|\boff\b|m20|m15|m12|\bmx\b/i.test(
						text
				  )
				? 'tuning'
				: /tip|insert|shallow|deep|foam|pad|seal|position/i.test(text)
					? 'fit'
					: /adapter|dongle|cable|\bamp\b|balanced|single.ended/i.test(text)
						? 'setup'
						: /sample|unit|proto|defect|\bs\d\b/i.test(text)
							? 'unit'
							: 'unknown';
	return { id: `v-${measurementId.slice(2)}`, file, label, kind, isDefault: index === 0 };
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
	let partition: string;
	if (typeof o.partition === 'string') partition = o.partition;
	else if (db.dbType === '5128' || /5128/.test(rig ?? '')) partition = `${form}-5128`;
	else if (form === 'iem') partition = 'iem-711';
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
		rigInferred:
			!rig ||
			(form === 'iem' &&
				partition === 'iem-711' &&
				typeof o.partition !== 'string' &&
				!/\b(?:711|60711)\b|60318[\s-]*4/i.test(rig)),
		permission:
			o.permission === 'permission granted' ? 'permission granted' : 'public, not explicitly licensed',
		crawledAt,
		calibration: configString(config, 'measurement_calibration_file')
	};
}

/** Edit-distance candidates are audit suggestions ONLY; no fuzzy identity merges. */
export function suspiciousNames(
	products: { id: string; brand: string; model: string }[]
): { left: string; right: string }[] {
	const groups = new Map<string, typeof products>();
	for (const p of products) {
		const key = normalise(p.brand);
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
