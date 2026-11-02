import { createRawSnippet } from 'svelte';
import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Tooltip from './Tooltip.svelte';

test('Escape hides a focused and hovered tooltip until the next interaction', async () => {
	const screen = await render(Tooltip, {
		label: 'Help',
		text: 'Measurement caveat',
		children: createRawSnippet(() => ({ render: () => '<span>?</span>' }))
	});
	const trigger = screen.getByRole('button', { name: 'Help' });
	await trigger.click();
	await expect.element(screen.getByRole('tooltip')).toBeVisible();
	const tooltip = screen.getByRole('tooltip').element();
	await userEvent.keyboard('{Escape}');
	await expect.element(trigger).toHaveFocus();
	await expect.element(trigger).not.toHaveAttribute('aria-describedby');
	await expect.element(tooltip).not.toBeVisible();
});
