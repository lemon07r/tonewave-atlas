import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { cached, CrawlBlockedError, HttpCache, parallelEach } from './cache.ts';

const roots: string[] = [];
async function root(): Promise<string> {
	const base = resolve(homedir(), '.local/tmp');
	await mkdir(base, { recursive: true });
	const path = await mkdtemp(resolve(base, 'tonewave-cache-test-'));
	roots.push(path);
	return path;
}
afterEach(async () => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

describe('HTTP cache', () => {
	it('persists validated bodies and revalidates with ETag and Last-Modified', async () => {
		const path = await root();
		const modified = 'Mon, 02 Nov 2026 00:00:00 GMT';
		const request = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response('curve text', { headers: { etag: '"abc"', 'last-modified': modified } })
			)
			.mockResolvedValueOnce(new Response(null, { status: 304 }));
		vi.stubGlobal('fetch', request);
		const url = 'https://test.squig.link/data/a.txt';
		const first = await new HttpCache(path).fetch(url);
		const second = await new HttpCache(path).fetch(url);
		expect(second.body).toEqual(first.body);
		expect(request.mock.calls[1]?.[1]?.headers).toMatchObject({
			'If-None-Match': '"abc"',
			'If-Modified-Since': modified,
			'User-Agent': expect.stringContaining('TonewaveAtlas') as unknown
		});
		expect((await cached(url, path))?.entry.status).toBe(200);
		expect(new TextDecoder().decode((await cached(url, path))?.body)).toBe('curve text');
	});
	it('retries transient server failures with backoff instead of caching failures as curves', async () => {
		const path = await root();
		vi.useFakeTimers();
		const request = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(null, { status: 503 }))
			.mockResolvedValueOnce(new Response('recovered'));
		vi.stubGlobal('fetch', request);
		const promise = new HttpCache(path).fetch('https://test.squig.link/retry');
		// Filesystem reads finish in real time; timer advancement starts after the first request.
		await vi.waitFor(() => {
			expect(request).toHaveBeenCalledTimes(1);
		});
		await vi.runAllTimersAsync();
		expect(new TextDecoder().decode((await promise).body)).toBe('recovered');
		expect(request).toHaveBeenCalledTimes(2);
	});
	it('stops further traffic after a blocking response', async () => {
		const path = await root();
		const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 403 }));
		vi.stubGlobal('fetch', request);
		const cache = new HttpCache(path);
		await expect(cache.fetch('https://test.squig.link/blocked')).rejects.toBeInstanceOf(CrawlBlockedError);
		await expect(cache.fetch('https://test.squig.link/other')).rejects.toBeInstanceOf(CrawlBlockedError);
		expect(request).toHaveBeenCalledTimes(1);
	});
	it('bounds global request concurrency and deduplicates in-flight URLs', async () => {
		const path = await root();
		let active = 0,
			maximum = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn<typeof fetch>().mockImplementation(async () => {
				active++;
				maximum = Math.max(maximum, active);
				await new Promise((r) => setTimeout(r, 2));
				active--;
				return new Response('ok');
			})
		);
		const cache = new HttpCache(path, 3);
		await Promise.all(Array.from({ length: 15 }, (_, i) => cache.fetch(`https://test.squig.link/${i % 10}`)));
		expect(maximum).toBeLessThanOrEqual(3);
		expect(fetch).toHaveBeenCalledTimes(10);
	});
	it('waits for in-flight work before reporting a queue failure', async () => {
		const finished: number[] = [];
		await expect(
			parallelEach(
				[0, 1, 2, 3],
				async (i) => {
					if (i === 0) throw new Error('stop');
					await new Promise((r) => setTimeout(r, 2));
					finished.push(i);
				},
				2
			)
		).rejects.toThrow('stop');
		expect(finished).toEqual([1]);
	});
});
