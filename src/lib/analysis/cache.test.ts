import { expect, test } from 'vitest';
import { AsyncLru } from './cache.ts';

test('retains recent requests and evicts the least recently used one', async () => {
	const cache = new AsyncLru<string, string>(2);
	let calls = 0;
	const get = (id: string) =>
		cache.get(id, async () => {
			calls++;
			return id;
		});
	const a = get('a');
	await get('b');
	expect(get('a')).toBe(a);
	await get('c');
	expect(get('a')).toBe(a);
	await get('b');
	expect(calls).toBe(4);
});

test('an evicted rejection cannot delete its newer replacement', async () => {
	const cache = new AsyncLru<string, string>(1);
	let reject!: (cause: Error) => void;
	const old = cache.get(
		'a',
		() =>
			new Promise((_, no) => {
				reject = no;
			})
	);
	await cache.get('b', async () => 'b');
	const replacement = cache.get('a', async () => 'new');
	reject(new Error('old failure'));
	await expect(old).rejects.toThrow('old failure');
	expect(cache.get('a', async () => 'wrong')).toBe(replacement);
});

test('retries a failed request', async () => {
	const cache = new AsyncLru<string, string>(1);
	await expect(
		cache.get('a', async () => {
			throw new Error('network');
		})
	).rejects.toThrow('network');
	expect(await cache.get('a', async () => 'recovered')).toBe('recovered');
});
