import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Slider from './Slider.svelte';

test.each([
	{ value: 100, typed: '150' },
	{ value: 0, typed: '-50' }
])('writes a clamped endpoint back when value stays $value', async ({ value, typed }) => {
	const onchange = vi.fn();
	const screen = await render(Slider, { label: 'Level', value, onchange });
	const numeric = screen.getByRole('spinbutton');
	await numeric.fill(typed);
	await userEvent.keyboard('{Tab}');
	await expect.element(numeric).toHaveValue(value);
	expect(onchange).toHaveBeenCalledWith(value);
});

test.each([
	{ min: 0, step: 0.1, typed: '0.3', expected: 0.3 },
	{ min: 0.05, step: 0.1, typed: '0.35', expected: 0.35 },
	{ min: 0, step: 1e-7, typed: '0.0000003', expected: 3e-7 }
])(
	'normalizes fractional steps without floating-point display artifacts: $typed',
	async ({ min, step, typed, expected }) => {
		const onchange = vi.fn();
		const screen = await render(Slider, { label: 'Level', min, max: 1, step, onchange });
		const numeric = screen.getByRole('spinbutton');
		await numeric.fill(typed);
		await userEvent.keyboard('{Tab}');
		expect(onchange).toHaveBeenCalledWith(expected);
		await expect.element(numeric).toHaveValue(expected);
	}
);
