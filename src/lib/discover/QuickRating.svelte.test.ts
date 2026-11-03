import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import QuickRatingHarness from './QuickRatingHarness.svelte';
import '#lib/styles/app.css';

test('quick Like adds immediately, Dislike updates, toggling clears, and Undo restores the preceding rating', async () => {
	const screen = await render(QuickRatingHarness);
	const like = screen.getByRole('button', { name: 'Like', exact: true });
	const dislike = screen.getByRole('button', { name: 'Dislike', exact: true });
	await like.click();
	await expect.element(like).toHaveAttribute('aria-pressed', 'true');
	await expect.element(screen.getByTestId('workspace-count')).toHaveTextContent('1');
	await dislike.click();
	await expect.element(dislike).toHaveAttribute('aria-pressed', 'true');
	await expect.element(like).toHaveAttribute('aria-pressed', 'false');
	await expect.element(screen.getByTestId('workspace-count')).toHaveTextContent('1');
	await screen.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect.element(like).toHaveAttribute('aria-pressed', 'true');
	await like.click();
	await expect.element(like).toHaveAttribute('aria-pressed', 'false');
	await screen.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect.element(like).toHaveAttribute('aria-pressed', 'true');
});
