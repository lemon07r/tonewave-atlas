import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Toast from './Toast.svelte';

test('keeps one live region mounted while notification content and controls change', async () => {
	const screen = await render(Toast, { message: '', ondismiss: vi.fn() });
	const status = screen.container.querySelector('[role="status"]');
	await expect.element(screen.getByRole('button', { name: 'Dismiss notification' })).not.toBeInTheDocument();
	await screen.rerender({ message: 'Profile cleared.' });
	expect(screen.container.querySelector('[role="status"]')).toBe(status);
	await expect.element(screen.getByRole('status')).toHaveTextContent('Profile cleared.');
	await expect.element(screen.getByRole('button', { name: 'Dismiss notification' })).toBeVisible();
	await screen.rerender({ message: '' });
	expect(screen.container.querySelector('[role="status"]')).toBe(status);
	await expect.element(screen.getByRole('status')).toHaveTextContent('');
});
