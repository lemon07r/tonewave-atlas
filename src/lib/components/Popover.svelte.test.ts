import { createRawSnippet } from 'svelte';
import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Popover from './Popover.svelte';

test('names an icon-only trigger and its non-modal dialog', async () => {
	const screen = await render(Popover, {
		label: 'Details',
		trigger: createRawSnippet(() => ({ render: () => '<span aria-hidden="true">?</span>' })),
		children: createRawSnippet(() => ({ render: () => '<p>Measurement details</p>' }))
	});
	await screen.getByRole('button', { name: 'Details', exact: true }).click();
	await expect.element(screen.getByRole('dialog', { name: 'Details', exact: true })).toBeVisible();
	const dialog = screen.getByRole('dialog', { name: 'Details', exact: true }).element();
	await userEvent.keyboard('{Escape}');
	await expect.element(dialog).not.toBeVisible();
});
