import * as Comlink from 'comlink';
import type { Analysis } from '#core/atlas/service.ts';
import type { AnalysisWorker } from '../../workers/analysis.ts';

let singleton:
	| {
			baseUrl: string;
			worker: Worker;
			root: Comlink.Remote<AnalysisWorker>;
			remote: Promise<Comlink.Remote<Analysis>>;
			cancelInitialization: () => void;
	  }
	| undefined;

/** Call in the browser, supplying asset('/data/'). Reuses one worker until dispose(). */
export function getAnalysis(baseUrl: string): Promise<Comlink.Remote<Analysis>> {
	if (singleton) {
		if (singleton.baseUrl !== baseUrl)
			throw new Error('Dispose the current analysis worker before changing datasets.');
		return singleton.remote;
	}
	const worker = new Worker(new URL('../../workers/analysis.ts', import.meta.url), { type: 'module' });
	const root = Comlink.wrap<AnalysisWorker>(worker);
	let cancelInitialization!: () => void;
	const remote = new Promise<Comlink.Remote<Analysis>>((resolve, reject) => {
		cancelInitialization = () => {
			reject(new Error('Analysis worker disposed before initialization completed.'));
		};
		void root.create(new URL(baseUrl, globalThis.location.href).href).then(resolve, reject);
	});
	singleton = { baseUrl, worker, root, remote, cancelInitialization };
	return remote;
}

export function dispose(): void {
	const current = singleton;
	if (!current) return;
	singleton = undefined;
	current.cancelInitialization();
	current.root[Comlink.releaseProxy]();
	current.worker.terminate();
}

export type { Analysis } from '#core/atlas/service.ts';
export type * from '#core/atlas/types.ts';
