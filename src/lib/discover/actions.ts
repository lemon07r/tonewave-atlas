import type { CandidateInfo } from '#core/atlas/types.ts';
import { serialiseCompare } from '#lib/compare/url.ts';

/** Tunings retain their actual measurement identities, never the default product consensus. */
export function compareQuery(
	candidate: CandidateInfo,
	reference: string | { productId: string; measurementId?: string }[]
): string {
	const references = typeof reference === 'string' ? [{ productId: reference }] : reference;
	const params = new URLSearchParams(candidate.product.form === 'headphone' ? 'form=headphones' : '');
	// Reserve the candidate first, including its explicit tuning measurements.
	const products = candidate.kind === 'default' ? [candidate.product.id] : [];
	const measurements = candidate.kind === 'tuning' ? [...new Set(candidate.measurementIds)].slice(0, 6) : [];
	const retained: typeof references = [];
	for (const ref of references) {
		const ids = ref.measurementId ? measurements : products;
		const id = ref.measurementId ?? ref.productId;
		if (ids.includes(id)) continue;
		if (products.length + measurements.length >= 6) break;
		ids.push(id);
		retained.push(ref);
	}
	return serialiseCompare(
		{
			products: [
				...retained.filter((r) => !r.measurementId).map((r) => r.productId),
				...(candidate.kind === 'default' ? [candidate.product.id] : [])
			],
			measurements: [
				...retained.flatMap((r) => (r.measurementId ? [r.measurementId] : [])),
				...(candidate.kind === 'tuning'
					? measurements.filter((id) => candidate.measurementIds.includes(id))
					: [])
			],
			channel: 'avg',
			smoothing: 12,
			difference: ''
		},
		params
	).toString();
}
