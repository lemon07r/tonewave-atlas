import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RankMarker from './RankMarker.svelte';

test('renders new, upward and downward movement with accessible descriptions, and nothing initially', async () => {
	const screen = await render(RankMarker, {});
	expect(screen.container.querySelector('.rank-change')).toBeNull();
	await screen.rerender({ change: 'new' });
	await expect.element(screen.getByText('New', { exact: true })).toHaveAttribute('aria-label', 'New match');
	await screen.rerender({ change: 3 });
	await expect.element(screen.getByText('↑3')).toHaveAttribute('aria-label', 'Moved up 3 places');
	await screen.rerender({ change: -2 });
	await expect.element(screen.getByText('↓2')).toHaveAttribute('aria-label', 'Moved down 2 places');
	await screen.rerender({ change: 0 });
	expect(screen.container.querySelector('.rank-change')).toBeNull();
});
