import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { CatalogMetadata } from './metadata.ts';

const value: CatalogMetadata = {
	identity: { products: [], measurements: [] },
	validation: [],
	measurements: []
};
const workers: FakeWorker[] = [];
class FakeWorker extends EventTarget {
	requests: {
		url: string;
		id: number;
		resolve: (value: CatalogMetadata) => void;
		reject: (error: unknown) => void;
	}[] = [];
	terminate = vi.fn();
	service = {
		load: vi.fn(
			(url: string, id: number) =>
				new Promise<CatalogMetadata>((resolve, reject) => {
					this.requests.push({ url, id, resolve, reject });
				})
		),
		cancel: vi.fn<(id: number) => Promise<void>>().mockResolvedValue(undefined),
		[Symbol.for('metadata-release')]: vi.fn()
	};
	constructor() {
		super();
		workers.push(this);
	}
}
function workerAt(index = 0) {
	const worker = workers[index];
	if (!worker) throw new Error(`Missing worker ${index}`);
	return worker;
}
function requestAt(workerIndex = 0, index = 0) {
	const request = workerAt(workerIndex).requests[index];
	if (!request) throw new Error(`Missing request ${index}`);
	return request;
}
vi.mock('comlink', () => ({
	wrap: (worker: FakeWorker) => worker.service,
	releaseProxy: Symbol.for('metadata-release')
}));
beforeEach(() => {
	vi.resetModules();
	workers.length = 0;
	vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => vi.unstubAllGlobals());

for (const event of ['error', 'messageerror']) {
	test(`a worker ${event} rejects every pending URL and recreates a worker on retry`, async () => {
		const { catalogMetadata } = await import('./client.ts');
		const first = catalogMetadata('one'),
			second = catalogMetadata('two');
		const outcomes = Promise.allSettled([first, second]);
		workerAt().dispatchEvent(new Event(event));
		expect((await outcomes).map((outcome) => outcome.status)).toEqual(['rejected', 'rejected']);
		expect(workerAt().terminate).toHaveBeenCalledOnce();
		const retry = catalogMetadata('one');
		expect(workers).toHaveLength(2);
		requestAt(1).resolve(value);
		await expect(retry).resolves.toEqual(value);
		// An old response cannot replace the fresh cache entry.
		requestAt().resolve({
			...value,
			identity: { products: [{ id: 'stale', brand: 'Fixture', model: 'Stale' }], measurements: [] }
		});
		await expect(catalogMetadata('one')).resolves.toEqual(value);
	});
}

test('one cancelled subscriber cannot cancel another subscriber to the same URL', async () => {
	const { catalogMetadata } = await import('./client.ts');
	const abort = new AbortController();
	const first = catalogMetadata('shared', abort.signal),
		second = catalogMetadata('shared');
	const cancelled = expect(first).rejects.toThrow('aborted');
	abort.abort();
	await cancelled;
	expect(workerAt().service.cancel).not.toHaveBeenCalled();
	expect(workerAt().terminate).not.toHaveBeenCalled();
	expect(workerAt().requests).toHaveLength(1);
	requestAt().resolve(value);
	await expect(second).resolves.toEqual(value);
});

test('abandoning the last consumer terminates decoding and the same URL is retryable', async () => {
	const { loadValidation } = await import('#lib/method/validation.ts');
	const abort = new AbortController();
	const first = loadValidation('abandoned', abort.signal);
	const cancelled = expect(first).rejects.toThrow('aborted');
	abort.abort();
	await cancelled;
	expect(workerAt().terminate).toHaveBeenCalledOnce();
	const retry = loadValidation('abandoned', new AbortController().signal);
	requestAt(1).resolve(value);
	await expect(retry).resolves.toEqual([]);
});

test('cancels only the abandoned URL while a different URL still needs the worker', async () => {
	const { catalogMetadata } = await import('./client.ts');
	const abort = new AbortController();
	const first = catalogMetadata('cancel', abort.signal),
		second = catalogMetadata('keep');
	const cancelled = expect(first).rejects.toThrow('aborted');
	abort.abort();
	await cancelled;
	expect(workerAt().service.cancel).toHaveBeenCalledExactlyOnceWith(requestAt().id);
	expect(workerAt().terminate).not.toHaveBeenCalled();
	requestAt(0, 1).resolve(value);
	await expect(second).resolves.toEqual(value);
});

test('ordinary request failures remain retryable without replacing a healthy worker', async () => {
	const { catalogMetadata } = await import('./client.ts');
	const failed = catalogMetadata('retry');
	const rejected = expect(failed).rejects.toThrow('offline');
	requestAt().reject(new Error('offline'));
	await rejected;
	const retry = catalogMetadata('retry');
	requestAt(0, 1).resolve(value);
	await expect(retry).resolves.toEqual(value);
	expect(workers).toHaveLength(1);
});
