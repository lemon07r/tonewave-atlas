import type { Measurement, Product } from '#core/dataset/types.ts';
import { identity } from './transform.ts';
import {
	foldedPadMarker,
	isFoldedReference,
	mergeDescriptorIdentities,
	type IdentityDescriptor
} from './identity-folds.ts';
import { tipSuffixes } from './variant-labels.ts';

const modified = /\[modified:|\b(?:mod(?:ded|ification|s)?|DIY|prototype|reshell)\b/i;

/** Used pads are worn stock; all other pad descriptors describe a response-changing swap. */
export function isPadSwapDescriptor(label: string): boolean {
	return /\b(?:ear)?pads?\b/i.test(label) && !/^\(?\s*used\s+pads\s*\)?$/i.test(label);
}

/** Positions, not substrings: fit words in real names or explicit modifications stay identity. */
export function fitIdentity(
	brand: string,
	model: string,
	acceptedParent: (model: string) => boolean = () => false
): IdentityDescriptor | null {
	if (modified.test(`${brand} ${model}`)) return null;
	const result = (parent: string, label: string): IdentityDescriptor | null => {
		parent = parent.trim();
		if (!parent || /^(?:sample|unit)\s*[:#-]?\s*\d+$/i.test(`${brand} ${parent}`.trim())) return null;
		return { parent, label: label.trim() };
	};
	const parenthesized = model.match(/^(.*?)\s*(\(([^()]*)\))\s*$/);
	if (parenthesized?.[1] && parenthesized[2] && parenthesized[3]) {
		const text = parenthesized[3].trim();
		const foamOnly =
			/\bfoam$/i.test(text) && tipSuffixes(`Fit (${text})`).some((s) => s.parent === 'Fit' && !s.unknown);
		if (
			/^(?:(?:deep|shallow)(?:\s+insertion)?|foam\s+pads\s+on|(?:[\p{L}\p{N}+-]+\s+)?(?:ear)?pads?)$/iu.test(
				text
			) ||
			foamOnly
		)
			return result(parenthesized[1], parenthesized[2]);
	}
	for (const pattern of [
		/^(.*?)\s+(deep|shallow)\s*$/i,
		/^(.*?)\s+(pad-rolling|\[pads\s+collection\]|-\s*pads)\s*$/i,
		/^(.*?)\s+(stock(?:\s+[\p{L}-]+)?\s+tips?)\s*$/iu
	]) {
		const match = model.match(pattern);
		if (match?.[1] && match[2]) return result(match[1], match[2]);
	}
	// Multiword named accessories have an exact accepted parent; no model words are guessed away.
	if (/\s+(?:tips?|(?:ear)?pads)\s*$/i.test(model)) {
		for (const boundary of [...model.matchAll(/\s+/g)].reverse()) {
			const parent = model.slice(0, boundary.index).trim();
			const label = model.slice(boundary.index + boundary[0].length).trim();
			if (/^\S.*\s+(?:tips?|(?:ear)?pads)$/i.test(label) && acceptedParent(parent))
				return result(parent, label);
		}
		// A single named accessory, or an alphanumeric tip code plus PRO, has a bounded suffix.
		const named = model.match(
			/^(.*?)\s+((?:[\p{L}]+[-]?\d+\s+pro|[\p{L}\p{N}+-]+)\s+(?:tips?|(?:ear)?pads))\s*$/iu
		);
		if (named?.[1] && named[2]) return result(named[1], named[2]);
	}
	return null;
}

export function mergeFitIdentities(
	products: Map<string, Product>,
	rows: readonly { measurement: Measurement }[],
	aliases: Record<string, string> = {},
	productAliases: Record<string, string> = {}
) {
	const key = (productId: string, m: Measurement) => `${productId}|${m.sourceId}|${m.partition}`;
	const stockDefaults = new Set(
		rows
			.filter((r) => r.measurement.variant.isDefault && !isFoldedReference(r.measurement))
			.map((r) => key(r.measurement.productId, r.measurement))
	);
	const pads = new Set<Measurement>();
	const retainedPads = new Map<
		string,
		{ productId: string; product: string; source: string; partition: string; reason: string }
	>();
	const ambiguous: { productId: string; product: string; reason: string }[] = [];
	const result = mergeDescriptorIdentities(
		products,
		rows,
		'fit',
		(p) => {
			const suffix = fitIdentity(p.brand, p.model, (parent) =>
				products.has(identity(p.brand, parent, p.form, aliases, productAliases).id)
			);
			if (
				!suffix &&
				!modified.test(`${p.brand} ${p.model}`) &&
				/\([^()]*\b(?:foam|(?:ear)?pads?|deep|shallow)\b[^()]*\)\s*$/i.test(p.model)
			)
				ambiguous.push({
					productId: p.id,
					product: `${p.brand} ${p.model}`,
					reason: 'mixed or unrecognized parenthesized fit marker; model identity retained'
				});
			return suffix;
		},
		aliases,
		productAliases,
		(m, parentId, suffix) => {
			if (!isPadSwapDescriptor(suffix.label)) return true;
			if (stockDefaults.has(key(parentId, m))) {
				pads.add(m);
				return true;
			}
			const p = products.get(m.productId);
			if (!p) throw new Error('Missing pad product');
			retainedPads.set(key(p.id, m), {
				productId: p.id,
				product: `${p.brand} ${p.model}`,
				source: m.sourceId,
				partition: m.partition,
				reason: 'no same-source/partition stock default; pad identity retained'
			});
			return false;
		}
	);
	for (const m of pads) m.provenance.processing.push(foldedPadMarker);
	return { ...result, retainedPads: [...retainedPads.values()], ambiguous };
}
