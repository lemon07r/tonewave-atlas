import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { atomicWrite, CACHE, readJson, record, sha256, USER_AGENT } from './common.ts';

export interface CacheEntry {
	url: string;
	status: number;
	etag: string | null;
	lastModified: string | null;
	fetchedAt: string;
	checkedAt: string;
	bodyHash: string | null;
}

export class CrawlBlockedError extends Error {}

export async function cached(
	url: string,
	root = CACHE
): Promise<{ entry: CacheEntry; body: Uint8Array } | null> {
	let raw: unknown;
	try {
		raw = await readJson(resolve(root, 'requests', `${sha256(url)}.json`));
	} catch (e) {
		if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return null;
		throw e;
	}
	if (
		!record(raw) ||
		raw.url !== url ||
		typeof raw.status !== 'number' ||
		typeof raw.fetchedAt !== 'string' ||
		typeof raw.checkedAt !== 'string' ||
		!(raw.bodyHash === null || typeof raw.bodyHash === 'string') ||
		!(raw.etag === null || typeof raw.etag === 'string') ||
		!(raw.lastModified === null || typeof raw.lastModified === 'string')
	)
		throw new Error(`Invalid cache record: ${url}`);
	const entry: CacheEntry = {
		url,
		status: raw.status,
		fetchedAt: raw.fetchedAt,
		checkedAt: raw.checkedAt,
		bodyHash: raw.bodyHash,
		etag: raw.etag,
		lastModified: raw.lastModified
	};
	const body = entry.bodyHash
		? Uint8Array.from(await readFile(resolve(root, 'bodies', entry.bodyHash)))
		: new Uint8Array();
	if (entry.bodyHash && sha256(body) !== entry.bodyHash) throw new Error(`Cache body hash mismatch: ${url}`);
	return { entry, body };
}

/** One shared pool per process; every HTTP attempt (including retries) holds one slot. */
export class HttpCache {
	private active = 0;
	private waiters: (() => void)[] = [];
	private blocked = false;
	private inFlight = new Map<string, Promise<Awaited<ReturnType<HttpCache['fetch']>>>>();
	constructor(privateRoot = CACHE, concurrency = 4) {
		this.root = privateRoot;
		if (concurrency < 1 || concurrency > 6) throw new Error('Concurrency must be 1…6');
		this.concurrency = concurrency;
	}
	private root: string;
	private concurrency: number;

	async fetch(url: string): Promise<{ entry: CacheEntry; body: Uint8Array }> {
		const existing = this.inFlight.get(url);
		if (existing) return existing;
		const task = this.request(url);
		this.inFlight.set(url, task);
		try {
			return await task;
		} finally {
			this.inFlight.delete(url);
		}
	}

	private async request(url: string): Promise<{ entry: CacheEntry; body: Uint8Array }> {
		if (this.active >= this.concurrency) await new Promise<void>((r) => this.waiters.push(r));
		else this.active++;
		try {
			if (this.blocked) throw new CrawlBlockedError('Crawl already blocked; no further requests');
			const previous = await cached(url, this.root);
			const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
			if (previous?.entry.status === 200) {
				if (previous.entry.etag) headers['If-None-Match'] = previous.entry.etag;
				if (previous.entry.lastModified) headers['If-Modified-Since'] = previous.entry.lastModified;
			}
			for (let attempt = 0; attempt < 5; attempt++) {
				if (this.isBlocked()) throw new CrawlBlockedError('Crawl blocked');
				let response: Response;
				try {
					response = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
				} catch (e) {
					if (attempt === 4) throw e;
					await setTimeout(1500 * 2 ** attempt);
					continue;
				}
				if (response.status === 429 || response.status >= 500) {
					await response.body?.cancel();
					if (attempt === 4) {
						if (response.status === 429) {
							this.blocked = true;
							throw new CrawlBlockedError(`Persistent 429: ${url}`);
						}
						throw new Error(`Persistent ${response.status}: ${url}`);
					}
					const retry = response.headers.get('retry-after');
					const seconds = retry ? Number(retry) : NaN;
					const until = retry && !Number.isFinite(seconds) ? Date.parse(retry) - Date.now() : seconds * 1000;
					const delay = Math.max(2000 * 2 ** attempt, Number.isFinite(until) ? until : 0);
					console.warn(`Retry ${response.status} in ${Math.ceil(delay / 1000)}s: ${url}`);
					await setTimeout(delay);
					continue;
				}
				if (response.status === 403) {
					await response.body?.cancel();
					this.blocked = true;
					throw new CrawlBlockedError(`HTTP 403 blocking: ${url}`);
				}
				const now = new Date().toISOString();
				if (response.status === 304 && previous?.entry.status === 200) {
					const entry = { ...previous.entry, checkedAt: now };
					await atomicWrite(resolve(this.root, 'requests', `${sha256(url)}.json`), JSON.stringify(entry));
					return { entry, body: previous.body };
				}
				const body = new Uint8Array(await response.arrayBuffer());
				const bodyHash = response.ok ? sha256(body) : null;
				if (bodyHash) await atomicWrite(resolve(this.root, 'bodies', bodyHash), body);
				const entry: CacheEntry = {
					url,
					status: response.status,
					etag: response.headers.get('etag'),
					lastModified: response.headers.get('last-modified'),
					fetchedAt: now,
					checkedAt: now,
					bodyHash
				};
				await atomicWrite(resolve(this.root, 'requests', `${sha256(url)}.json`), JSON.stringify(entry));
				return { entry, body };
			}
			throw new Error(`Retry exhausted: ${url}`);
		} finally {
			const next = this.waiters.shift();
			if (next) next();
			else this.active--;
		}
	}

	private isBlocked(): boolean {
		return this.blocked;
	}
}

/** Bounded worker queue avoids keeping tens of thousands of pending requests in memory. */
export async function parallelEach<T>(
	values: T[],
	run: (value: T) => Promise<void>,
	concurrency = 4
): Promise<void> {
	let index = 0;
	let failed = false;
	const results = await Promise.allSettled(
		Array.from({ length: concurrency }, async () => {
			while (!failed && index < values.length) {
				const value = values[index++];
				try {
					if (value !== undefined) await run(value);
				} catch (e) {
					failed = true;
					throw e;
				}
			}
		})
	);
	const failure = results.find((r) => r.status === 'rejected');
	if (failure?.status === 'rejected') throw failure.reason;
}
