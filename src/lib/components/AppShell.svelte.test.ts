import { createRawSnippet } from 'svelte';
import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import AppShell from './AppShell.svelte';
import '#lib/styles/app.css';

vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/') } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
const children = createRawSnippet(() => ({ render: () => '<p>Page content</p>' }));

test('keyboard skip navigation leaves a visible focus indicator on main', async () => {
	const screen = await render(AppShell, { children });
	screen.getByRole('link', { name: 'Skip to content' }).element().focus();
	await userEvent.keyboard('{Enter}');
	await expect.element(screen.getByRole('main')).toHaveFocus();
	expect(getComputedStyle(screen.getByRole('main').element()).outlineStyle).not.toBe('none');
});

test('theme changes synchronize browser chrome with the active paper colour', async () => {
	localStorage.removeItem('tonewave-theme');
	const meta = document.createElement('meta');
	meta.name = 'theme-color';
	meta.content = '#f4f0e6';
	document.head.append(meta);
	try {
		const screen = await render(AppShell, { children });
		await screen.getByRole('button', { name: 'Theme: system. Switch to light theme' }).click();
		await screen.getByRole('button', { name: 'Theme: light. Switch to dark theme' }).click();
		expect(meta.content).toBe('#171b25');
		await screen.getByRole('button', { name: 'Theme: dark. Switch to system theme' }).click();
		expect(meta.content).toBe(getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());
	} finally {
		meta.remove();
		localStorage.removeItem('tonewave-theme');
		delete document.documentElement.dataset.theme;
	}
});
