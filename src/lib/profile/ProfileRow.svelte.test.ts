import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import ProfileRow from './ProfileRow.svelte';
import '#lib/styles/app.css';

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
