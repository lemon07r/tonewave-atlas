import { createRawSnippet } from 'svelte';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Notice from './Notice.svelte';

test('distinguishes caution from information by shape as well as colour', async () => {
	const screen = await render(Notice, {
		children: createRawSnippet(() => ({ render: () => '<p>A caveat</p>' }))
	});
	const info = screen.container.querySelector('svg path')?.getAttribute('d');
	await screen.rerender({ kind: 'caution' });
	expect(screen.container.querySelector('svg path')?.getAttribute('d')).not.toBe(info);
	await expect.element(screen.getByText('A caveat')).toBeVisible();
});
