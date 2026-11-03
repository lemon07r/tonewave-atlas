import type { Product } from '#core/dataset/types.ts';
import { canonicalBrandKey, identityKey, modelIdentity } from './identity-keys.ts';

const marker = /\[modified:[\s\S]*\]/i;
const word = /\b(?:mod|modded|modified|prototype|proto)\b/i;
const custom = /^Custom\s*\(.+\)$/i;

export interface ProductFlagReport {
	modified: number;
	baseLinks: number;
	rules: { a: number; b: number; c: number };
	wordMatches: (Pick<Product, 'id' | 'brand' | 'model' | 'form'> & { baseProductId?: string })[];
}

function stockModel(model: string): string {
	const start = /\[modified:/i.exec(model)?.index;
	if (start !== undefined) {
		// Descriptors may contain nested brackets; only a complete terminal marker is removable.
		let depth = 0;
		for (let i = start; i < model.length; i++) {
			if (model[i] === '[') depth++;
			if (model[i] !== ']') continue;
			if (--depth !== 0) continue;
			if (!model.slice(i + 1).trim()) model = model.slice(0, start);
			break;
		}
	}
	return model
		.replace(/\b(?:foam[\s-]+)?(?:mod|modded|modified|prototype|proto)(?:[\s-]+foam)?\b/gi, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

/** Metadata only: never rewrite identities, measurement membership, or redirects. Rule counts overlap. */
export function markModifiedProducts(
	products: readonly Product[],
	aliases: Readonly<Record<string, string>> = {}
): ProductFlagReport {
	const report: ProductFlagReport = {
		modified: 0,
		baseLinks: 0,
		rules: { a: 0, b: 0, c: 0 },
		wordMatches: []
	};
	const words = new Set<Product>();
	const modified = products.filter((product) => {
		const a = marker.test(product.model),
			b = word.test(product.model),
			c = custom.test(product.brand.trim());
		if (a) report.rules.a++;
		if (b) {
			report.rules.b++;
			words.add(product);
		}
		if (c) report.rules.c++;
		if (!a && !b && !c) return false;
		product.modified = true;
		return true;
	});
	report.modified = modified.length;
	const key = (product: Product, model = product.model): string =>
		`${product.form}:${canonicalBrandKey(product.brand, aliases)}:${identityKey(modelIdentity(model))}`;
	const stocks = Map.groupBy(
		products.filter((product) => !product.modified),
		(product) => key(product)
	);
	for (const product of modified) {
		const model = stockModel(product.model);
		const candidates = identityKey(modelIdentity(model)) ? stocks.get(key(product, model)) : undefined;
		const base = candidates?.length === 1 ? candidates[0] : undefined;
		if (base) {
			product.baseProductId = base.id;
			report.baseLinks++;
		}
		if (words.has(product))
			report.wordMatches.push({
				id: product.id,
				brand: product.brand,
				model: product.model,
				form: product.form,
				...(product.baseProductId ? { baseProductId: product.baseProductId } : {})
			});
	}
	report.wordMatches.sort((a, b) => a.id.localeCompare(b.id, 'en'));
	return report;
}
