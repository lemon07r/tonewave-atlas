import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Skeleton from './Skeleton.svelte';

test('provides the loading message once as live-region text', async () => {
	const screen = await render(Skeleton, { label: 'Loading measurements' });
	await expect.element(screen.getByRole('status')).toHaveTextContent('Loading measurements');
	await expect.element(screen.getByRole('status')).not.toHaveAttribute('aria-label');
});
