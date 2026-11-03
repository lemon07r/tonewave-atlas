import type { Measurement, Product } from '#core/dataset/types.ts';
import { identity } from './transform.ts';
import { mergeDescriptorIdentities, type IdentityDescriptor } from './identity-folds.ts';

/** Positions, not substrings: fit words in real names or explicit modifications stay identity. */
export function fitIdentity(
	brand: string,
	model: string,
	acceptedParent: (model: string) => boolean = () => false
): IdentityDescriptor | null {
	if (/\[modified:|\b(?:mod(?:ded|ification|s)?|DIY|prototype|reshell)\b/i.test(`${brand} ${model}`))
		return null;
	const result = (parent: string, label: string): IdentityDescriptor | null => {
		parent = parent.trim();
		if (!parent || /^(?:sample|unit)\s*[:#-]?\s*\d+$/i.test(`${brand} ${parent}`.trim())) return null;
		return { parent, label: label.trim() };
	};
	const parenthesized = model.match(/^(.*?)\s*(\(([^()]*)\))\s*$/);
	if (parenthesized?.[1] && parenthesized[2] && parenthesized[3]) {
		const text = parenthesized[3].trim();
		if (/^(?:deep|shallow)(?:\s+insertion)?$|\bfoam$|\b(?:ear)?pads?(?:\s+on)?$/i.test(text))
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
	return mergeDescriptorIdentities(
		products,
		rows,
		'fit',
		(p) =>
			fitIdentity(p.brand, p.model, (parent) =>
				products.has(identity(p.brand, parent, p.form, aliases, productAliases).id)
			),
		aliases,
		productAliases
	);
}
