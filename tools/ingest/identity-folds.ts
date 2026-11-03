import type { Measurement, Product } from '#core/dataset/types.ts';
import { identity, normalise, withoutAttribution } from './transform.ts';

type DescriptorKind = 'sample/unit' | 'fit';
export interface IdentityDescriptor {
	parent: string;
	label: string;
}

export const foldedPadMarker = 'folded aftermarket pad: never eligible as a stock default';

export function isFoldedPad(measurement: Measurement): boolean {
	return measurement.provenance.processing.includes(foldedPadMarker);
}

/** Folded experiment curves must not replace an existing source/partition base default. */
export function isFoldedReference(measurement: Measurement): boolean {
	return measurement.provenance.processing.some((step) =>
		/^recognized (?:sample\/unit|fit) identity: /.test(step)
	);
}

/** Run after curve acceptance: descriptor cleanup never deduplicates or changes raw measurements. */
export function mergeDescriptorIdentities(
	products: Map<string, Product>,
	rows: readonly { measurement: Measurement }[],
	kind: DescriptorKind,
	descriptor: (product: Product) => IdentityDescriptor | null,
	aliases: Record<string, string> = {},
	productAliases: Record<string, string> = {},
	canFold: (measurement: Measurement, parentId: string, suffix: IdentityDescriptor) => boolean = () => true
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
		const suffix = descriptor(p);
		if (!suffix) continue;
		const target = identity(p.brand, suffix.parent, p.form, aliases, productAliases);
		if (target.id === p.id) continue;
		const selected = rows.filter(
			(r) => r.measurement.productId === p.id && canFold(r.measurement, target.id, suffix)
		);
		if (!selected.length) continue;
		let parent = products.get(target.id);
		if (!parent) {
			parent = { id: target.id, brand: target.brand, model: target.model, form: p.form, measurementIds: [] };
			products.set(parent.id, parent);
			created.push(parent.id);
		}
		for (const { measurement: m } of selected) {
			const previous = m.variant.kind;
			const labels = [withoutAttribution(m.variant.file)];
			for (const label of [m.variant.label, suffix.label])
				if (label.trim() && !labels.some((text) => normalise(text).includes(normalise(label))))
					labels.push(label);
			m.productId = parent.id;
			m.variant.label = labels.filter(Boolean).join(' · ');
			m.variant.kind = kind === 'sample/unit' ? 'unit' : previous === 'tuning' ? 'tuning' : 'fit';
			m.variant.isDefault = false;
			m.provenance.processing.push(
				`recognized ${kind} identity: ${p.brand} ${p.model} -> ${parent.brand} ${parent.model}; ${suffix.label}; previous kind ${previous}; original file and label retained`
			);
			parent.measurementIds.push(m.id);
		}
		const moved = new Set(selected.map((r) => r.measurement.id));
		p.measurementIds = p.measurementIds.filter((id) => !moved.has(id));
		if (!p.measurementIds.length) products.delete(p.id);
		moves.push({
			from: p.id,
			to: parent.id,
			form: p.form,
			before: `${p.brand} ${p.model}`,
			parent: `${parent.brand} ${parent.model}`,
			label: suffix.label,
			measurements: selected.length
		});
	}
	return { moves, created };
}
