import { wrap, type Remote } from 'comlink';
import { AsyncLru } from '#lib/analysis/cache.ts';
import type { CatalogMetadata } from './metadata.ts';

let service: Remote<{ load: (url: string) => Promise<CatalogMetadata> }> | undefined;
const metadata = new AsyncLru<string, CatalogMetadata>(4);

/** Browser-only, lazy and shared across identity and Method lookups. Failed loads are retryable. */
export function catalogMetadata(url: string): Promise<CatalogMetadata> {
	return metadata.get(url, () => {
		service ??= wrap(new Worker(new URL('./metadata.worker.ts', import.meta.url), { type: 'module' }));
		return service.load(url);
	});
}
