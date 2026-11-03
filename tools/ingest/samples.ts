import type { Measurement, Product } from '#core/dataset/types.ts';
import { identity, normalise, withoutAttribution } from './transform.ts';

const sampleIdentityPrefix = 'recognized sample/unit identity: ';

/** Retained provenance distinguishes folded units from the source's existing base defaults. */
export function isFoldedSample(measurement: Measurement): boolean {
	return measurement.provenance.processing.some((step) => step.startsWith(sampleIdentityPrefix));
}

/** Only explicit unit markers: bare S8/S12 and generation/model tokens are not evidence. */
export function sampleIdentity(model: string): { parent: string; label: string } | null {
	const labels: string[] = [];
	const remove = (marker: string) => {
		labels.push(marker.trim());
		return ' ';
	};
	const parent = model
		.replace(/\(\s*(?:(?:sample|unit)\s*[:#-]?\s*\d+|s\d+)\s*\)/gi, remove)
		.replace(
			/\b(?:sample|unit)\s*[:#-]?\s*\d+(?=\s+(?:mod(?:ded|ification)?|DIY|prototype|reshell)\b)/gi,
			remove
		)
		.replace(/\b(?:sample|unit)\s*[:#-]?\s*\d+\s*$/gi, remove)
		.replace(/\s+/g, ' ')
		.trim();
	return labels.length && parent ? { parent, label: labels.join(' · ') } : null;
}

/** Fold after curve acceptance: identity cleanup must not deduplicate or change raw measurements. */
export function mergeSampleIdentities(
	products: Map<string, Product>,
	rows: readonly { measurement: Measurement }[],
	aliases: Record<string, string> = {},
	productAliases: Record<string, string> = {}
) {
	const moves: {
		from: string;
		to: string;
		form: Product['form'];
		before: string;
		parent: string;
		label: string;
		measurements: number;
	}[] = [];
	const created: string[] = [];
	for (const p of [...products.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
		const sample = sampleIdentity(p.model);
		if (!sample) continue;
		const target = identity(p.brand, sample.parent, p.form, aliases, productAliases);
		if (target.id === p.id) continue;
		let parent = products.get(target.id);
		if (!parent) {
			parent = {
				id: target.id,
				brand: target.brand,
				model: target.model,
				form: p.form,
				measurementIds: []
			};
			products.set(parent.id, parent);
			created.push(parent.id);
		}
		for (const { measurement: m } of rows.filter((r) => r.measurement.productId === p.id)) {
			const previous = m.variant.kind;
			const labels = [withoutAttribution(m.variant.file)];
			for (const label of [m.variant.label, sample.label])
				if (label.trim() && !labels.some((text) => normalise(text).includes(normalise(label))))
					labels.push(label);
			m.productId = parent.id;
			m.variant.label = labels.filter(Boolean).join(' · ');
			m.variant.kind = 'unit';
			m.variant.isDefault = false;
			m.provenance.processing.push(
				`${sampleIdentityPrefix}${p.brand} ${p.model} -> ${parent.brand} ${parent.model}; ${sample.label}; previous kind ${previous}; original file and label retained`
			);
			parent.measurementIds.push(m.id);
		}
		products.delete(p.id);
		moves.push({
			from: p.id,
			to: parent.id,
			form: p.form,
			before: `${p.brand} ${p.model}`,
			parent: `${parent.brand} ${parent.model}`,
			label: sample.label,
			measurements: p.measurementIds.length
		});
	}
	return { moves, created };
}
