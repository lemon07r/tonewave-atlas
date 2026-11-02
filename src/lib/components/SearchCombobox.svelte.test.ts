import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { SearchItem } from '#lib/search.ts';
import SearchCombobox from './SearchCombobox.svelte';
import '#lib/styles/app.css';

const items: SearchItem[] = [
	{ id: 'a', label: 'Atlas Alpha', group: 'Products', variants: 2, sources: 3 },
	{ id: 'b', label: 'Atlas Beta', group: 'Products', variants: 1, sources: 2 },
	{ id: 'r', label: 'Reference', group: 'Targets' }
];

test('filters, highlights and selects by keyboard while focus stays on the input', async () => {
	const onselect = vi.fn<(item: SearchItem) => void>();
	const screen = await render(SearchCombobox, { items, onselect });
	const input = screen.getByRole('combobox', { name: 'Search products' });
	await input.fill('atlas');
	await expect.element(input).toHaveAttribute('aria-expanded', 'true');
	await expect.element(screen.getByRole('option', { name: /Atlas Alpha/ })).toBeVisible();
	await expect.element(screen.getByRole('option', { name: /Reference/ })).not.toBeInTheDocument();
	expect(screen.container.querySelector('mark')?.textContent).toBe('Atlas');
	await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
	expect(onselect).toHaveBeenCalledWith(items[1]);
	await expect.element(input).toHaveValue('Atlas Beta');
	await expect.element(input).toHaveFocus();
	await expect.element(input).toHaveAttribute('aria-expanded', 'false');
});

test('groups results and supports Up, Home, End and Escape', async () => {
	const onselect = vi.fn<(item: SearchItem) => void>();
	const screen = await render(SearchCombobox, { items, onselect });
	const input = screen.getByRole('combobox');
	await input.click();
	await expect.element(screen.getByRole('group', { name: 'Targets' })).toBeVisible();
	await userEvent.keyboard('{ArrowUp}');
	await expect
		.element(screen.getByRole('option', { name: 'Reference' }))
		.toHaveAttribute('aria-selected', 'true');
	await userEvent.keyboard('{Home}');
	await expect
		.element(screen.getByRole('option', { name: /Atlas Alpha/ }))
		.toHaveAttribute('aria-selected', 'true');
	await userEvent.keyboard('{End}{Escape}');
	await expect.element(input).toHaveAttribute('aria-expanded', 'false');
	expect(onselect).not.toHaveBeenCalled();
});

test('exposes loading and empty states and tolerates asynchronously replaced results', async () => {
	const onselect = vi.fn<(item: SearchItem) => void>();
	const screen = await render(SearchCombobox, { items: [], loading: true, filter: false, onselect });
	const input = screen.getByRole('combobox');
	await input.fill('Atlas');
	await expect.element(screen.getByRole('status')).toHaveTextContent('Searching…');
	await screen.rerender({ items, loading: false });
	await userEvent.keyboard('{ArrowDown}');
	await screen.rerender({ items: [] });
	await expect.element(input).not.toHaveAttribute('aria-activedescendant');
	await userEvent.keyboard('{Enter}');
	expect(onselect).not.toHaveBeenCalled();
	await expect
		.element(screen.getByRole('status'))
		.toHaveTextContent('No matching products. Try another name.');
});

test('slash focuses search without stealing typing from another input', async () => {
	const screen = await render(SearchCombobox, { items, shortcut: true, onselect: () => {} });
	await userEvent.keyboard('/');
	await expect.element(screen.getByRole('combobox')).toHaveFocus();
	await userEvent.keyboard('/');
	await expect.element(screen.getByRole('combobox')).toHaveValue('/');
});
