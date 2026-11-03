import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import ProfileRow from './ProfileRow.svelte';
import '#lib/styles/app.css';

test('collapsed neutral and fit-only references explain why they do not affect sound matching', async () => {
	const screen = await render(ProfileRow, {
		item: { productId: 'a', rating: 'neutral', strength: 0, soundRelated: true },
		name: 'Fixture',
		partition: '',
		onchange: vi.fn(),
		onremove: vi.fn()
	});
	await expect
		.element(screen.getByText('Neutral · not used for sound matching.', { exact: true }))
		.toBeVisible();
	await screen.rerender({ item: { productId: 'a', rating: 'like', strength: 0.6, soundRelated: false } });
	await expect
		.element(screen.getByText('Recorded, but not used to model sound', { exact: true }))
		.toBeVisible();
});

test('keeps saved references compact and opens Details once after an explicit first rating', async () => {
	const item = { productId: 'test', rating: 'unrated' as const, strength: 0, soundRelated: true };
	const onchange = vi.fn();
	const screen = await render(ProfileRow, {
		item,
		name: 'Test reference',
		partition: 'iem-711',
		onchange,
		onremove: vi.fn()
	});
	const disclosure = screen.container.querySelector('details');
	expect(disclosure?.open).toBe(false);
	await screen.getByRole('radio', { name: 'Like', exact: true }).click();
	expect(disclosure?.open).toBe(true);
	await screen.rerender({ item: { ...item, rating: 'like', strength: 0.6 } });
	await expect.element(screen.getByRole('group', { name: 'Liked aspects (optional)' })).toBeVisible();
	await screen.getByText('Details', { exact: false }).click();
	expect(disclosure?.open).toBe(false);
	await screen.getByRole('radio', { name: 'Like', exact: true }).click();
	await userEvent.keyboard('{ArrowRight}');
	await userEvent.keyboard('{ArrowRight}');
	expect(disclosure?.open).toBe(false);
	await expect.element(screen.getByRole('radio', { name: 'Dislike', exact: true })).toHaveFocus();
	expect(onchange).toHaveBeenLastCalledWith({ ...item, rating: 'dislike', strength: 1 });
});
