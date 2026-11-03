import type { Measurement, Product } from '#core/dataset/types.ts';
import { mergeDescriptorIdentities } from './identity-folds.ts';

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
	return mergeDescriptorIdentities(
		products,
		rows,
		'sample/unit',
		(p) => sampleIdentity(p.model),
		aliases,
		productAliases
	);
}
