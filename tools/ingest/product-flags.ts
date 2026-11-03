import type { Product } from '#core/dataset/types.ts';
import { identityKey, modelIdentity } from './identity-keys.ts';
import { identity } from './transform.ts';

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

function stockModelCandidates(model: string): string[][] {
	// Preserve accepted links before trying the two broader, ordered fallbacks.
	const candidates = [[stockModel(model)]];
	const normalized = model.normalize('NFKC');
	const segment = /\s*(?:\[[^[\]]*\]|\([^()]*\))\s*$/u.exec(normalized);
	if (segment && word.test(segment[0])) candidates.push([normalized.slice(0, segment.index).trim()]);
	const phrases: string[] = [];
	const qualifier = "[\\p{L}\\p{N}]+(?:[-'’][\\p{L}\\p{N}]+)*";
	for (const count of [1, 2]) {
		const phrase = new RegExp(
			`(?:^|\\s+)(?:${qualifier}\\s+){${count}}(?:mod|modded|prototype)\\s*$`,
			'iu'
		).exec(normalized);
		if (!phrase) continue;
		const consumed = phrase[0].trim().split(/\s+/).slice(0, -1);
		if (
			consumed.some(
				(token) =>
					/\p{N}/u.test(token) ||
					/^\p{L}$/u.test(token) ||
					/^(?:ii|iii|iv|v|vi|vii|viii|ix|x|pro|plus|max|mini|lite|se|mk|mark|gen|edition)$/i.test(token)
			)
		)
			break;
		phrases.push(normalized.slice(0, phrase.index).trim());
	}
	candidates.push(phrases);
	return candidates;
}

/** Metadata only: never rewrite identities, measurement membership, or redirects. Rule counts overlap. */
export function markModifiedProducts(
	products: readonly Product[],
	aliases: Readonly<Record<string, string>> = {},
	productAliases: Readonly<Record<string, string>> = {}
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
		identity(product.brand, model, product.form, aliases, productAliases).key;
	const stocks = Map.groupBy(
		products.filter((product) => !product.modified),
		(product) => key(product)
	);
	for (const product of modified) {
		for (const models of stockModelCandidates(product.model)) {
			const candidates = new Map<string, Product>();
			for (const model of models) {
				if (marker.test(model) || word.test(model) || custom.test(product.brand.trim())) continue;
				if (!identityKey(modelIdentity(model))) continue;
				for (const stock of stocks.get(key(product, model)) ?? []) candidates.set(stock.id, stock);
			}
			if (!candidates.size) continue;
			// The one- and two-word phrase interpretations must agree on a single stock product.
			const base = candidates.size === 1 ? candidates.values().next().value : undefined;
			if (base) {
				product.baseProductId = base.id;
				report.baseLinks++;
			}
			break;
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
