import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispose, getAnalysis } from './client.ts';

const rpc = vi.hoisted(() => ({
	create: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
	release: vi.fn(),
	terminate: vi.fn(),
	childRelease: vi.fn(),
	worker: vi.fn(),
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
	rpc.release.mockImplementation(() => {
		rpc.events.push('release-root');
	});
	rpc.terminate.mockImplementation(() => {
		rpc.events.push('terminate');
	});
	vi.stubGlobal(
		'Worker',
		class {
			constructor(...args: unknown[]) {
				rpc.worker(...args);
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
		expect(await getAnalysis('/data/')).toBe(child);
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
		expect(await replacement).toBe(child);
		expect(rpc.worker).toHaveBeenCalledTimes(2);
		expect(rpc.childRelease).not.toHaveBeenCalled();
	});
});
