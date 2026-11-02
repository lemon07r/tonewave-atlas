import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Rating from './Rating.svelte';
import '#lib/styles/app.css';

test('provides a named native radio group with mutually exclusive choices', async () => {
	const onchange = vi.fn();
	const screen = await render(Rating, { value: 'like', onchange });
	await expect.element(screen.getByRole('group', { name: 'Your impression' })).toBeVisible();
	await expect.element(screen.getByRole('radio', { name: 'Like', exact: true })).toBeChecked();
	await screen.getByRole('radio', { name: 'Love', exact: true }).click();
	await expect.element(screen.getByRole('radio', { name: 'Love', exact: true })).toBeChecked();
	await expect.element(screen.getByRole('radio', { name: 'Like', exact: true })).not.toBeChecked();
	expect(onchange).toHaveBeenLastCalledWith('love');
});

test('uses native arrow-key radio navigation', async () => {
	const onchange = vi.fn();
	const screen = await render(Rating, { value: 'neutral', onchange });
	await screen.getByRole('radio', { name: 'Neutral', exact: true }).click();
	await userEvent.keyboard('{ArrowRight}');
	await expect.element(screen.getByRole('radio', { name: 'Dislike', exact: true })).toBeChecked();
	await expect.element(screen.getByRole('radio', { name: 'Dislike', exact: true })).toHaveFocus();
	expect(onchange).toHaveBeenLastCalledWith('dislike');
});

test('Not rated and Dislike have different symbols as well as text labels', async () => {
	const screen = await render(Rating, { compact: true });
	const unrated = screen.getByRole('radio', { name: 'Not rated', exact: true });
	const dislike = screen.getByRole('radio', { name: 'Dislike', exact: true });
	await expect.element(unrated).toBeVisible();
	await expect.element(dislike).toBeVisible();
	const unratedSymbol = unrated.element().closest('label')?.querySelector('svg')?.innerHTML;
	const dislikeSymbol = dislike.element().closest('label')?.querySelector('svg')?.innerHTML;
	expect(unratedSymbol).toBeDefined();
	expect(dislikeSymbol).toBeDefined();
	expect(unratedSymbol).not.toBe(dislikeSymbol);
	await expect.element(screen.getByRole('group', { name: 'Your impression' })).toBeVisible();
});
