import * as Comlink from 'comlink';
import { AtlasService, type Analysis } from '#core/atlas/service.ts';

const api = {
	create(baseUrl: string): Analysis & Comlink.ProxyMarked {
		return Comlink.proxy(new AtlasService({ baseUrl, fetch: globalThis.fetch.bind(globalThis) }));
	}
};

export type AnalysisWorker = typeof api;
Comlink.expose(api);
