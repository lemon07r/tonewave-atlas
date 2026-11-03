import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { releaseProxy } from 'comlink';
import { dispose, getAnalysis } from './client.ts';

const rpc = vi.hoisted(() => ({
	create: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
	release: vi.fn(),
	terminate: vi.fn(),
	childRelease: vi.fn(),
	worker: vi.fn(),
	instances: [] as EventTarget[],
	events: [] as string[],
	releaseProxy: Symbol('releaseProxy')
}));

vi.mock('comlink', () => ({
	wrap: () => ({ create: rpc.create, [rpc.releaseProxy]: rpc.release }),
	releaseProxy: rpc.releaseProxy
}));

function deferred() {
	let resolve!: (value: unknown) => void;
	const promise = new Promise<unknown>((yes) => {
		resolve = yes;
	});
	return { promise, resolve };
}

beforeEach(() => {
	vi.clearAllMocks();
	rpc.events.length = 0;
	rpc.instances.length = 0;
	rpc.release.mockImplementation(() => {
		rpc.events.push('release-root');
	});
	rpc.terminate.mockImplementation(() => {
		rpc.events.push('terminate');
	});
	vi.stubGlobal(
		'Worker',
		class extends EventTarget {
			constructor(...args: unknown[]) {
				super();
				rpc.worker(...args);
				rpc.instances.push(this);
			}
			terminate = rpc.terminate;
		}
	);
	vi.stubGlobal('location', { href: 'https://atlas.example/compare' });
});

afterEach(() => {
	dispose();
	vi.unstubAllGlobals();
});

describe('analysis client lifecycle', () => {
	it.each(['error', 'messageerror', 'dispose'])(
		'rejects in-flight RPCs after initialization on %s and replaces the worker',
		async (event) => {
			const pending = deferred();
			const similar = vi.fn(() => pending.promise);
			const summary = vi.fn(() => pending.promise);
			rpc.create.mockResolvedValueOnce({ similar, summary }).mockResolvedValueOnce({});
			const service = await getAnalysis('/data/');
			const request = { productId: 'fixture' };
			const first = service.similar(request);
			const second = service.summary();
			const rejected = expect(first).rejects.toThrow(/Please try again/);
			const alsoRejected = expect(second).rejects.toThrow(/Please try again/);
			expect(similar).toHaveBeenCalledWith(request);
			if (event === 'dispose') dispose();
			else rpc.instances[0]?.dispatchEvent(new Event(event, { cancelable: true }));
			await Promise.all([rejected, alsoRejected]);
			await expect(service.summary()).rejects.toThrow(/Please try again/);
			expect(summary).toHaveBeenCalledOnce();
			await getAnalysis('/data/');
			expect(rpc.worker).toHaveBeenCalledTimes(2);
			expect(rpc.events).toEqual(['release-root', 'terminate']);
		}
	);
	it.each(['error', 'messageerror'])(
		'rejects every pending caller on worker %s and retries with a fresh worker',
		async (event) => {
			const failed = deferred();
			rpc.create.mockReturnValueOnce(failed.promise).mockResolvedValueOnce({});
			const first = getAnalysis('/data/');
			const second = getAnalysis('/data/');
			const rejection = expect(first).rejects.toThrow('Analysis worker failed to load. Please try again.');
			expect(second).toBe(first);
			rpc.instances[0]?.dispatchEvent(new Event(event, { cancelable: true }));
			await rejection;
			expect(rpc.events).toEqual(['release-root', 'terminate']);
			const next = getAnalysis('/data/');
			expect(next).not.toBe(first);
			await next;
			// A late event/completion from the failed worker must not discard its replacement.
			rpc.instances[0]?.dispatchEvent(new Event(event));
			failed.resolve({});
			await failed.promise;
			expect(getAnalysis('/data/')).toBe(next);
			expect(rpc.worker).toHaveBeenCalledTimes(2);
		}
	);
	it('discards a rejected creation so a retry does not reuse a rejected singleton', async () => {
		rpc.create.mockRejectedValueOnce(new Error('Initialization failed')).mockResolvedValueOnce({});
		await expect(getAnalysis('/data/')).rejects.toThrow('Initialization failed');
		await getAnalysis('/data/');
		expect(rpc.worker).toHaveBeenCalledTimes(2);
	});
	it('rejects pending initialization and releases the root once before terminating', async () => {
		const creation = deferred();
		rpc.create.mockReturnValue(creation.promise);
		const pending = getAnalysis('/data/');
		const rejected = expect(pending).rejects.toThrow(/disposed/i);
		expect(getAnalysis('/data/')).toBe(pending);
		dispose();
		await rejected;
		expect(rpc.events).toEqual(['release-root', 'terminate']);
		dispose();
		expect(rpc.release).toHaveBeenCalledTimes(1);
		creation.resolve({ [rpc.releaseProxy]: rpc.childRelease });
		await creation.promise;
		await Promise.resolve();
		expect(rpc.childRelease).not.toHaveBeenCalled();
	});
	it('does not release a resolved child proxy after the worker has terminated', async () => {
		const child = { [rpc.releaseProxy]: rpc.childRelease };
		rpc.create.mockResolvedValue(child);
		const service = await getAnalysis('/data/');
		expect(service[releaseProxy]).toBe(rpc.childRelease);
		expect(rpc.create).toHaveBeenCalledWith('https://atlas.example/data/');
		expect(() => getAnalysis('/other-data/')).toThrow(/Dispose/);
		dispose();
		await Promise.resolve();
		expect(rpc.events).toEqual(['release-root', 'terminate']);
		expect(rpc.childRelease).not.toHaveBeenCalled();
	});
	it('allows replacement while a disposed initialization completes late', async () => {
		const first = deferred(),
			second = deferred();
		rpc.create.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const cancelled = getAnalysis('/data/');
		const rejected = expect(cancelled).rejects.toThrow(/disposed/i);
		dispose();
		await rejected;
		const replacement = getAnalysis('/next/');
		first.resolve({ [rpc.releaseProxy]: rpc.childRelease });
		await first.promise;
		expect(getAnalysis('/next/')).toBe(replacement);
		const child = { [rpc.releaseProxy]: rpc.childRelease };
		second.resolve(child);
		const service = await replacement;
		expect(service[releaseProxy]).toBe(rpc.childRelease);
		expect(rpc.worker).toHaveBeenCalledTimes(2);
		expect(rpc.childRelease).not.toHaveBeenCalled();
	});
});
