import type { CandidateInfo } from '#core/atlas/types.ts';
import { serialiseCompare } from '#lib/compare/url.ts';

/** Tunings retain their actual measurement identities, never the default product consensus. */
export function compareQuery(candidate: CandidateInfo, referenceProductId: string): string {
	const params = new URLSearchParams(candidate.product.form === 'headphone' ? 'form=headphones' : '');
	return serialiseCompare(
		{
			products: [referenceProductId, ...(candidate.kind === 'default' ? [candidate.product.id] : [])],
			measurements: candidate.kind === 'tuning' ? candidate.measurementIds.slice(0, 5) : [],
			channel: 'avg',
			smoothing: 12,
			difference: ''
		},
		params
	).toString();
}
