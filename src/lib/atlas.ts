import { resolve } from '$app/paths';
import type { Form } from '#core/dataset/types.ts';
import { getAnalysis, type ProductListItem } from './analysis/client.ts';

/**
 * The shared analysis worker for the published dataset. Browser only.
 * `asset()` only accepts files present at type-check time, and static/data/ is generated, so the
 * dataset root is derived from the app root instead.
 */
export function analysis() {
	return getAnalysis(`${resolve('/')}data/`);
}

/** The form factor selected in the shell (`?form=headphones`); IEMs otherwise. */
export function formFromUrl(url: URL): Form {
	return url.searchParams.get('form') === 'headphones' ? 'headphone' : 'iem';
}

const lists = new Map<Form, Promise<ProductListItem[]>>();

/** Search list for a form factor, fetched once per page load; failures are retried on the next call. */
export function productList(form: Form): Promise<ProductListItem[]> {
	let list = lists.get(form);
	if (!list) {
		list = analysis().then((service) => service.products(form));
		list.catch(() => lists.delete(form));
		lists.set(form, list);
	}
	return list;
}
