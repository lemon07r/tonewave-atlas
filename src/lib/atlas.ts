import { resolve } from '$app/paths';
import type { Form } from '#core/dataset/types.ts';
import { getAnalysis, type ProductListItem } from './analysis/client.ts';
import { AsyncLru } from './analysis/cache.ts';

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

const lists = new WeakMap<ReturnType<typeof analysis>, AsyncLru<Form, ProductListItem[]>>();

/** Search lists belong to the current worker/dataset generation; failures are retryable. */
export function productList(form: Form): Promise<ProductListItem[]> {
	const worker = analysis();
	let cache = lists.get(worker);
	if (!cache) lists.set(worker, (cache = new AsyncLru(2)));
	return cache.get(form, () => worker.then((service) => service.products(form)));
}
