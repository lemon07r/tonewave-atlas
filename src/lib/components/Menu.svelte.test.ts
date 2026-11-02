import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Menu from './Menu.svelte';
import '#lib/styles/app.css';

const items = [
	{ label: 'First', action: vi.fn() },
	{ label: 'Unavailable', disabled: true, action: vi.fn() },
	{ label: 'Last', action: vi.fn() }
];

test('ArrowUp opens on the last enabled item after the native toggle event', async () => {
	const screen = await render(Menu, { label: 'Actions', items });
	const popup = screen.container.querySelector<HTMLElement>('[role="menu"]');
	if (!popup) throw new Error('Menu missing');
	const opened = new Promise<void>((resolve) => {
		popup.addEventListener(
			'toggle',
			() => {
				resolve();
			},
			{ once: true }
		);
	});
	screen.getByRole('button', { name: 'Actions' }).element().focus();
	await userEvent.keyboard('{ArrowUp}');
	await opened;
	await expect.element(screen.getByRole('menuitem', { name: 'Last' })).toHaveFocus();
});

test('ArrowUp from the menu container reaches the last item and skips disabled items', async () => {
	const screen = await render(Menu, { label: 'Actions', items });
	await screen.getByRole('button', { name: 'Actions' }).click();
	await expect.element(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
	screen.getByRole('menu').element().focus();
	await userEvent.keyboard('{ArrowUp}');
	await expect.element(screen.getByRole('menuitem', { name: 'Last' })).toHaveFocus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.element(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
});

test('allows repeated action labels without duplicate-key errors', async () => {
	const action = vi.fn();
	const item = { label: 'Run', action };
	const screen = await render(Menu, {
		label: 'Actions',
		items: [item, item]
	});
	await screen.getByRole('button', { name: 'Actions' }).click();
	await expect.element(screen.getByRole('menuitem').nth(1)).toBeVisible();
	await screen.getByRole('menuitem').nth(1).click();
	expect(action).toHaveBeenCalledOnce();
});
