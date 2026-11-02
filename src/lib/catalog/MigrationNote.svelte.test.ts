import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MigrationNote from './MigrationNote.svelte';

for (const action of ['Undo', 'Dismiss catalog update']) {
	test(`${action} leaves focus on the stable page heading when the notice disappears`, async () => {
		const main = document.createElement('main');
		const heading = document.createElement('h1');
		heading.textContent = 'Fixture page';
		main.append(heading);
		document.body.append(main);
		try {
			const callback = vi.fn();
			const screen = await render(MigrationNote, {
				messages: ['Fixture notice'],
				onundo: callback,
				ondismiss: callback
			});
			await screen.getByRole('button', { name: action, exact: true }).click();
			await screen.rerender({ messages: [] });
			expect(callback).toHaveBeenCalledOnce();
			expect(document.activeElement).toBe(heading);
		} finally {
			main.remove();
		}
	});
}
