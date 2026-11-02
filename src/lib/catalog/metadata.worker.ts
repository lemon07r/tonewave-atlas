import { expose } from 'comlink';
import { readCatalogMetadata } from './metadata.ts';

const requests = new Map<number, AbortController>();
expose({
	async load(url: string, id: number) {
		const abort = new AbortController();
		requests.set(id, abort);
		try {
			return await readCatalogMetadata(url, abort.signal);
		} finally {
			requests.delete(id);
		}
	},
	cancel(id: number) {
		requests.get(id)?.abort();
	}
});
