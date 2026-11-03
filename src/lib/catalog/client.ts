import { releaseProxy, wrap, type Remote } from 'comlink';
import type { CatalogMetadata } from './metadata.ts';

interface MetadataService {
	load: (url: string, id: number) => Promise<CatalogMetadata>;
	cancel: (id: number) => void;
}
interface Host {
	worker: Worker;
	service: Remote<MetadataService>;
	dispose: () => void;
}
interface Subscriber {
	resolve: (value: CatalogMetadata) => void;
	reject: (error: unknown) => void;
	cleanup: () => void;
}
interface Job {
	id: number;
	url: string;
	host: Host;
	subscribers: Set<Subscriber>;
}
let host: Host | undefined;
let sequence = 0;
const jobs = new Map<string, Job>();
const cache = new Map<string, CatalogMetadata>();
const asError = (error: unknown): Error =>
	error instanceof Error ? error : new Error('Catalog metadata request failed.', { cause: error });
const abortError = (signal?: AbortSignal): Error =>
	signal?.reason instanceof Error
		? signal.reason
		: new DOMException('Metadata request aborted.', 'AbortError');

function finish(job: Job, outcome: { value: CatalogMetadata } | { error: unknown }): void {
	if (jobs.get(job.url) !== job) return;
	jobs.delete(job.url);
	if ('value' in outcome) {
		cache.set(job.url, outcome.value);
		while (cache.size > 4) cache.delete(cache.keys().next().value as string);
	}
	for (const subscriber of job.subscribers) {
		subscriber.cleanup();
		if ('value' in outcome) subscriber.resolve(outcome.value);
		else subscriber.reject(outcome.error);
	}
	job.subscribers.clear();
}

function failHost(current: Host, error: unknown): void {
	current.dispose();
	for (const job of jobs.values()) if (job.host === current) finish(job, { error });
}

function workerHost(): Host {
	if (host) return host;
	const worker = new Worker(new URL('./metadata.worker.ts', import.meta.url), { type: 'module' });
	const service = wrap<MetadataService>(worker);
	const failed = (event: Event) => {
		event.preventDefault();
		failHost(current, new Error('Catalog metadata worker failed. Please try again.', { cause: event }));
	};
	const current: Host = {
		worker,
		service,
		dispose: () => {
			worker.removeEventListener('error', failed);
			worker.removeEventListener('messageerror', failed);
			service[releaseProxy]();
			worker.terminate();
			if (host === current) host = undefined;
		}
	};
	worker.addEventListener('error', failed);
	worker.addEventListener('messageerror', failed);
	host = current;
	return current;
}

/** Shared, bounded metadata cache. Each caller owns only its subscription, not another caller's work. */
export function catalogMetadata(url: string, signal?: AbortSignal): Promise<CatalogMetadata> {
	if (signal?.aborted) return Promise.reject(abortError(signal));
	const cached = cache.get(url);
	if (cached) {
		cache.delete(url);
		cache.set(url, cached);
		return Promise.resolve(cached);
	}
	let job = jobs.get(url);
	if (!job) {
		try {
			job = { id: ++sequence, url, host: workerHost(), subscribers: new Set() };
			jobs.set(url, job);
			const request = job;
			void request.host.service.load(url, request.id).then(
				(value) => {
					finish(request, { value });
				},
				(error: unknown) => {
					finish(request, { error });
				}
			);
		} catch (error) {
			if (host) failHost(host, error);
			return Promise.reject(asError(error));
		}
	}
	const request = job;
	return new Promise((resolve, reject) => {
		const abort = () => {
			request.subscribers.delete(subscriber);
			subscriber.cleanup();
			reject(abortError(signal));
			if (request.subscribers.size || jobs.get(url) !== request) return;
			jobs.delete(url);
			// Other URLs may still need this worker. Cancel just this transfer in that case.
			if (jobs.size)
				void request.host.service.cancel(request.id).catch((error: unknown) => {
					failHost(request.host, error);
				});
			else request.host.dispose(); // Also interrupts abandoned decoding/projection.
		};
		const subscriber: Subscriber = {
			resolve,
			reject,
			cleanup: () => signal?.removeEventListener('abort', abort)
		};
		request.subscribers.add(subscriber);
		signal?.addEventListener('abort', abort, { once: true });
	});
}
