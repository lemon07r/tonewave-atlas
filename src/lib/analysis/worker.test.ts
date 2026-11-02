import { Worker } from 'node:worker_threads';
import * as Comlink from 'comlink';
import { expect, it } from 'vitest';
import { GRID } from '#core/grid.ts';
import type { AnalysisWorker } from '../../workers/analysis.ts';

it('exposes the actual worker service through Comlink with cloneable typed-array results', async () => {
	// Node's worker threads use EventEmitter rather than the browser Worker event API.
	const entry = new URL('../../workers/analysis.ts', import.meta.url).href;
	const worker = new Worker(
		new URL(
			`data:text/javascript,${encodeURIComponent(`
		import { parentPort } from 'node:worker_threads';
		globalThis.addEventListener = (_, listener) => parentPort.on('message', data => listener({ data }));
		globalThis.postMessage = (value, transfer) => parentPort.postMessage(value, transfer);
		await import(${JSON.stringify(entry)});
	`)}`
		)
	);
	const listeners = new Map<EventListenerOrEventListenerObject, (data: unknown) => void>();
	const endpoint: Comlink.Endpoint = {
		postMessage(message) {
			worker.postMessage(message);
		},
		addEventListener(_type, listener) {
			const handler = (data: unknown) => {
				const event = new MessageEvent('message', { data });
				if (typeof listener === 'function') listener(event);
				else listener.handleEvent(event);
			};
			listeners.set(listener, handler);
			worker.on('message', handler);
		},
		removeEventListener(_type, listener) {
			const handler = listeners.get(listener);
			if (handler) worker.off('message', handler);
			listeners.delete(listener);
		}
	};
	const root = Comlink.wrap<AnalysisWorker>(endpoint);
	try {
		const remote = await root.create('https://unused.example/data/');
		const upload = await remote.parseUpload(
			Array.from(GRID, (hz) => `${hz} ${Math.log2(hz)}`).join('\n'),
			'private.txt'
		);
		expect(upload.ok).toBe(true);
		if (!upload.ok) return;
		expect(upload.values).toBeInstanceOf(Float64Array);
		const request = {
			uploadId: upload.uploadId,
			target: { kind: 'curve' as const, values: upload.values },
			maxFilters: 0
		};
		const first = await remote.peq(request);
		const second = await remote.peq(request);
		expect(first.ok && first.result.residualDistanceDb).toBeCloseTo(0, 8);
		expect(second).toEqual(first);
		remote[Comlink.releaseProxy]();
	} finally {
		root[Comlink.releaseProxy]();
		await worker.terminate();
	}
});
