import { afterEach, beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
	vi.resetModules();
});
afterEach(() => {
	vi.unstubAllGlobals();
});

test('deduplicates across calls and reloads without forgetting notices after the hundredth', async () => {
	let saved: string | null = null;
	vi.stubGlobal('sessionStorage', {
		getItem: () => saved,
		setItem: (_: string, value: string) => {
			saved = value;
		}
	});
	const first = await import('./notice.ts');
	const messages = Array.from({ length: 105 }, (_, i) => `notice-${i}`);
	expect(first.migrationMessages(messages)).toEqual(messages);
	expect(first.migrationMessages(messages)).toEqual([]);
	vi.resetModules();
	expect((await import('./notice.ts')).migrationMessages(messages)).toEqual([]);
});

test('ignores malformed and non-string stored notices', async () => {
	for (const saved of ['{broken', '{}', '[1,null,"seen"]']) {
		vi.resetModules();
		vi.stubGlobal('sessionStorage', { getItem: () => saved, setItem: vi.fn() });
		const { migrationMessages } = await import('./notice.ts');
		expect(migrationMessages(['fresh', 'fresh'])).toEqual(['fresh']);
	}
});

test('unavailable storage still deduplicates within the running session', async () => {
	vi.stubGlobal('sessionStorage', {
		getItem: () => {
			throw new Error('denied');
		},
		setItem: () => {
			throw new Error('denied');
		}
	});
	const { migrationMessages } = await import('./notice.ts');
	expect(migrationMessages(['fresh'])).toEqual(['fresh']);
	expect(migrationMessages(['fresh'])).toEqual([]);
});
