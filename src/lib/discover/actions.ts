import type { CandidateInfo } from '#core/atlas/types.ts';
import { serialiseCompare } from '#lib/compare/url.ts';

/** Tunings retain their actual measurement identities, never the default product consensus. */
export function compareQuery(
	candidate: CandidateInfo,
	reference: string | { productId: string; measurementId?: string }[]
): string {
	const references = typeof reference === 'string' ? [{ productId: reference }] : reference;
	const params = new URLSearchParams(candidate.product.form === 'headphone' ? 'form=headphones' : '');
	return serialiseCompare(
		{
			products: [
				...references.filter((r) => !r.measurementId).map((r) => r.productId),
				...(candidate.kind === 'default' ? [candidate.product.id] : [])
			],
			measurements: [
				...references.flatMap((r) => (r.measurementId ? [r.measurementId] : [])),
				...(candidate.kind === 'tuning' ? candidate.measurementIds : [])
			].slice(
				0,
				6 - references.filter((r) => !r.measurementId).length - (candidate.kind === 'default' ? 1 : 0)
			),
			channel: 'avg',
			smoothing: 12,
			difference: ''
		},
		params
	).toString();
}
