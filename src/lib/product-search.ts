/** Catalog-owned names only: punctuation, accents and joined model numbers are interchangeable. */
function searchTokens(text: string): string[] {
	return (
		text
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/([a-z])(\d)/g, '$1 $2')
			.replace(/(\d)([a-z])/g, '$1 $2')
			.match(/[a-z0-9]+/g) ?? []
	);
}

/** Bounded optimal-string-alignment distance; includes adjacent typing transpositions. */
function edits(a: string, b: string, limit: number): number {
	if (Math.abs(a.length - b.length) > limit) return limit + 1;
	let previousPrevious: number[] = [];
	let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let j = 1; j <= b.length; j++) {
			row[j] = Math.min(
				(row[j - 1] ?? 0) + 1,
				(previous[j] ?? 0) + 1,
				(previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)
			);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
				row[j] = Math.min(row[j] ?? Infinity, (previousPrevious[j - 2] ?? 0) + 1);
		}
		previousPrevious = previous;
		previous = row;
	}
	return previous[b.length] ?? limit + 1;
}

/** Build once per catalog. Query cost is linear in products with bounded short-token comparisons. */
export function productSearch<T extends { brand: string; model: string }>(products: readonly T[]) {
	const index = products.map((product, order) => ({
		product,
		order,
		tokens: searchTokens(`${product.brand} ${product.model}`)
	}));
	return (query: string, limit = 60): T[] => {
		const needles = searchTokens(query).slice(0, 12);
		if (!needles.length) return products.slice(0, limit);
		return index
			.flatMap(({ product, order, tokens }) => {
				let score = 0;
				for (const needle of needles) {
					let best = Infinity;
					for (const token of tokens) {
						if (token === needle) {
							best = 0;
							break;
						}
						if (token.startsWith(needle)) best = Math.min(best, 0.25);
						if (needle.length >= 4) {
							const bound = needle.length >= 8 ? 2 : 1;
							const distance = edits(needle, token, bound);
							if (distance <= bound) best = Math.min(best, distance);
						}
					}
					if (!Number.isFinite(best)) return [];
					score += best;
				}
				return [{ product, score, order }];
			})
			.sort((a, b) => a.score - b.score || a.order - b.order)
			.slice(0, limit)
			.map(({ product }) => product);
	};
}
