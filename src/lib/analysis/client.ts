import * as Comlink from 'comlink';
import type { Analysis } from '#core/atlas/service.ts';
import type { AnalysisWorker } from '../../workers/analysis.ts';

let singleton:
	| {
			baseUrl: string;
			worker: Worker;
			root: Comlink.Remote<AnalysisWorker>;
			remote: Promise<Comlink.Remote<Analysis>>;
			rejectPending: (cause: unknown) => void;
			cleanup: () => void;
	  }
	| undefined;

/** Call in the browser, supplying asset('/data/'). Reuses one worker until dispose(). */
export function getAnalysis(baseUrl: string): Promise<Comlink.Remote<Analysis>> {
	if (singleton) {
		if (singleton.baseUrl !== baseUrl)
			throw new Error('Dispose the current analysis worker before changing datasets.');
		return singleton.remote;
	}
	let worker: Worker;
	try {
		worker = new Worker(new URL('../../workers/analysis.ts', import.meta.url), { type: 'module' });
	} catch (cause) {
		return Promise.reject(new Error('Analysis worker failed to load. Please try again.', { cause }));
	}
	const root = Comlink.wrap<AnalysisWorker>(worker);
	let resolveInitialization!: (service: Comlink.Remote<Analysis>) => void;
	let rejectInitialization!: (cause: unknown) => void;
	let rejectCalls!: (cause: unknown) => void;
	let stopped = false;
	const failure = new Promise<never>((_, reject) => {
		rejectCalls = reject;
	});
	// A worker can fail while no RPC is waiting; each RPC still observes the original rejection.
	void failure.catch(() => {});
	const remote = new Promise<Comlink.Remote<Analysis>>((resolve, reject) => {
		resolveInitialization = resolve;
		rejectInitialization = reject;
	});
	function rejectPending(cause: unknown) {
		if (stopped) return;
		stopped = true;
		rejectInitialization(cause);
		rejectCalls(cause);
	}
	const failed = (event: Event) => {
		event.preventDefault();
		fail(new Error('Analysis worker failed to load. Please try again.', { cause: event }));
	};
	const current = {
		baseUrl,
		worker,
		root,
		remote,
		rejectPending,
		cleanup: () => {
			worker.removeEventListener('error', failed);
			worker.removeEventListener('messageerror', failed);
		}
	};
	function fail(cause: unknown) {
		rejectPending(cause);
		if (singleton === current) dispose();
	}
	worker.addEventListener('error', failed);
	worker.addEventListener('messageerror', failed);
	singleton = current;
	void root.create(new URL(baseUrl, globalThis.location.href).href).then((service) => {
		if (stopped) return;
		resolveInitialization(
			new Proxy(service, {
				get(target, property, receiver) {
					const method: unknown = Reflect.get(target, property, receiver);
					if (typeof method !== 'function' || property === 'then' || property === Comlink.releaseProxy)
						return method;
					return (...args: unknown[]) => {
						if (stopped) return failure;
						const call: unknown = Reflect.apply(method, target, args);
						return Promise.race([call, failure]);
					};
				}
			})
		);
	}, fail);
	return remote;
}

export function dispose(): void {
	const current = singleton;
	if (!current) return;
	singleton = undefined;
	current.cleanup();
	current.rejectPending(new Error('Analysis worker disposed. Please try again.'));
	current.root[Comlink.releaseProxy]();
	current.worker.terminate();
}

export type { Analysis } from '#core/atlas/service.ts';
export type * from '#core/atlas/types.ts';
