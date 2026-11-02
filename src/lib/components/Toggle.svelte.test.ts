import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Toggle from './Toggle.svelte';
import '#lib/styles/app.css';

test('uses the disabled cursor on the complete label, not only its text and track', async () => {
	const screen = await render(Toggle, { label: 'Regions', disabled: true });
	const label = screen.getByRole('switch').element().closest('label');
	if (!label) throw new Error('Toggle label missing');
	expect(getComputedStyle(label).cursor).toBe('not-allowed');
	await screen.rerender({ disabled: false });
	expect(getComputedStyle(label).cursor).toBe('pointer');
});
