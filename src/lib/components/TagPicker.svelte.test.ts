import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TagPicker from './TagPicker.svelte';
import '#lib/styles/app.css';

test('selected reasons keep the same accessible name without a spoken decorative check mark', async () => {
	const screen = await render(TagPicker, { options: ['Too much bass'] });
	const reason = screen.getByRole('checkbox', { name: 'Too much bass', exact: true });
	await reason.click();
	await expect.element(reason).toBeChecked();
	expect(screen.container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	await reason.click();
	await expect.element(reason).not.toBeChecked();
});
