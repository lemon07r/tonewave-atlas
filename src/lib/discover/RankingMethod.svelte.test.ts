import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RankingMethod from './RankingMethod.svelte';

test('explains each ranking route in one sentence with details available on demand', async () => {
	const screen = await render(RankingMethod, {
		route: 'similar',
		referenceName: 'Truthear Hexa',
		rig: '711-family coupler',
		likedCount: 1
	});
	await expect
		.element(
			screen.getByText('Closest measured responses to Truthear Hexa on 711-family coupler', { exact: true })
		)
		.toBeVisible();
	await screen.getByText('How this ranking works', { exact: true }).click();
	await expect.element(screen.getByText(/after smoothing and level alignment/)).toBeVisible();
	await expect.element(screen.getByText(/returned matches plus up to 10\s+more/)).toBeVisible();
	await expect.element(screen.getByText(/sides with fewer than 3 reviewers aren't assessed/)).toBeVisible();
	await expect
		.element(screen.getByText(/does not assess unit variation or whether a difference is audible/))
		.toBeVisible();
	await screen.rerender({ route: 'compare', likedCount: 3 });
	await expect
		.element(
			screen.getByText('Products that balance your 3 liked references (mean/worst-case)', { exact: true })
		)
		.toBeVisible();
	await expect.element(screen.getByText(/Each distance is level-aligned independently/)).toBeVisible();
	await screen.rerender({ route: 'taste' });
	await expect
		.element(
			screen.getByText('Ranked by your taste profile: likes pull, sound-related dislikes push away', {
				exact: true
			})
		)
		.toBeVisible();
	await expect.element(screen.getByText(/near-duplicate avoidance/)).toBeVisible();
});
