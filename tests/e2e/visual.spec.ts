import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { WorkspaceItem } from '../../src/lib/profile/profile.ts';
import { expectTradeoffRows } from './tradeoffs.ts';
import { reviewerForReference } from './catalog.ts';

const shots = join(process.env.HOME ?? '', '.local/tmp/tw-shots/redesign/final');
mkdirSync(shots, { recursive: true });
const reference = 'p-437de4e3e3402077cdc3';
const volume = 'p-9104c8bb39d66e906811';
const nova = 'p-1b241163b22023defb6f';
const positive = (productId: string): WorkspaceItem => ({
	productId,
	rating: 'like',
	strength: 0.6,
	soundRelated: true
});
const ratingsUrl = (items: WorkspaceItem[]) =>
	`/?${new URLSearchParams({ rig: 'iem-711', ratings: JSON.stringify(items) })}`;

for (const theme of ['light', 'dark'] as const) {
	test.describe(theme, () => {
		test.use({ colorScheme: theme });
		test('Listening Room discovery states remain readable across the review viewports', async ({
			page
		}, info) => {
			test.setTimeout(90000);
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			async function capture(name: string, anchor?: string) {
				if (anchor)
					await page
						.locator(anchor)
						.first()
						.evaluate((element) => {
							element.scrollIntoView({ block: 'start' });
						});
				else
					await page.evaluate(() => {
						window.scrollTo(0, 0);
					});
				expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(
					true
				);
				await page.screenshot({
					scale: 'css',
					path: join(shots, `${name}-${info.project.name}-${theme}.png`)
				});
			}
			async function ready() {
				await expect(page.locator('.result-row')).toHaveCount(20);
			}
			await page.goto('/?ratings=[]');
			await expect(page.locator('.example')).toHaveCount(3);
			await capture('discover-empty');
			const search = page.getByRole('combobox', { name: 'Add an IEM', exact: true });
			await search.fill('crinear refernce');
			await expect(page.getByRole('option').first()).toContainText('CrinEar Reference');
			await search.press('ArrowDown');
			await search.press('Enter');
			const item = page.getByRole('region', { name: 'CrinEar Reference', exact: true });
			await expect(item.getByRole('radio', { name: 'Not rated', exact: true })).toBeChecked();
			await search.press('Escape');
			await expect(page.locator('.chart-column h2')).toHaveText('Choose a rating to draw your reference.');
			await capture('discover-unrated');
			await item.getByRole('radio', { name: 'Like', exact: true }).check();
			await ready();
			await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
			await item.locator('summary').click();
			await page
				.locator('.result-row')
				.first()
				.getByRole('button', { name: 'Show on chart', exact: true })
				.click();
			await expect(page.locator('.legend-row')).toHaveCount(2);
			await capture('discover-single');
			await capture('discover-single-chart', '.chart-panel');
			await page.locator('.result-row').first().locator('details:not(.rate-row) > summary').click();
			await capture('discover-evidence', '.result-row');
			await page.goto(ratingsUrl([positive(reference), positive(volume)]));
			await ready();
			await page
				.locator('.result-row')
				.first()
				.getByRole('button', { name: 'Show on chart', exact: true })
				.click();
			await expect(page.locator('.legend-row')).toHaveCount(3);
			await capture('discover-multi');
			await page.locator('.result-row').first().locator('details:not(.rate-row) > summary').click();
			await expectTradeoffRows(page, ['CrinEar Reference', 'Softears Volume S'], 'mean');
			await capture('discover-multi-evidence', '.result-row');
			const reviewer = reviewerForReference(reference);
			await page.goto(
				`/?${new URLSearchParams({ ref: reference, rig: reviewer.selectedPartition, sources: reviewer.id, sourceMode: 'only' })}`
			);
			await ready();
			await page.locator('.refine > summary').click();
			await expect(
				page.locator('.source-options').getByRole('checkbox', { name: reviewer.name, exact: true })
			).toBeChecked();
			await expect(page.getByRole('combobox', { name: 'Reviewer scoring mode' })).toHaveValue('only');
			await capture('discover-reviewers', '.source-filter');
			await page.goto(
				ratingsUrl([
					positive(reference),
					positive(volume),
					{ ...positive(nova), rating: 'dislike', strength: 1, dislikeReasons: ['bass-lacks-punch'] }
				])
			);
			await ready();
			await expect(page.getByRole('heading', { name: 'Taste matches', exact: true })).toBeVisible();
			await page.locator('.model > summary').click();
			await page
				.locator('.result-row')
				.first()
				.getByRole('button', { name: 'Show on chart', exact: true })
				.click();
			await capture('discover-taste-model', '.model');
			await page.locator('.result-row').first().locator('details:not(.rate-row) > summary').click();
			await capture('discover-taste-evidence', '.result-row');
			expect(
				(await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
					.violations
			).toEqual([]);
			await page.goto(
				`/?${new URLSearchParams({ rig: 'iem-5128', ratings: JSON.stringify([positive(reference), { ...positive(volume), measurementId: 'm-016c491c5c1e659cc5ac' }]) })}`
			);
			await expect(page.locator('.diagnostics')).toContainText('(High Impedance Setting)');
			await expect(
				page.getByRole('radio', { name: 'Like', exact: true }).and(page.locator(':checked'))
			).toHaveCount(2);
			await expect(page.locator('.chart-column h2')).toHaveText(
				'This rig doesn’t cover every reference. Choose a rig below.'
			);
			await expect(
				page.locator('.compatible-rigs').getByRole('button', { name: 'Use 711-family coupler', exact: true })
			).toBeVisible();
			await capture('discover-missing-variant', '.results');
			await page.goto('/method');
			await expect(page.getByRole('region', { name: 'iem-711 validation', exact: true })).toBeVisible();
			await capture('pages-validation', '.validation');
			expect(errors).toEqual([]);
		});
	});
}

test('Discover uploads require a rig and remain session-local while saved ratings can be restored', async ({
	page
}) => {
	await page.goto(`/?ref=${reference}`);
	await expect(page.locator('.result-row')).toHaveCount(20);
	await page.locator('.workspace-tools > summary').click();
	const saved = await page.evaluate(() => localStorage.getItem('tonewave.profile.v1'));
	const input = page.getByLabel('Local reference measurement', { exact: true });
	await expect(input).toBeDisabled();
	await page.getByRole('combobox', { name: 'Upload measurement rig', exact: true }).selectOption('iem-711');
	await input.setInputFiles({
		name: 'bad.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('invalid measurement')
	});
	await expect(page.getByText('Not enough distinct frequency points', { exact: true })).toBeVisible();
	const fixture = {
		name: 'local-test-measurement.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from(
			Array.from({ length: 240 }, (_, i) => `${20 * 2 ** (i / 24)} ${Math.sin(i / 30)}`).join('\n')
		)
	};
	await input.setInputFiles(fixture);
	await expect(page.getByText('Local reference: local-test-measurement.txt', { exact: true })).toBeVisible();
	await expect(page.locator('.legend-row').first()).toContainText('Your local measurement');
	await expect(input).toHaveValue('');
	expect(page.url()).not.toContain(fixture.name);
	expect(await page.evaluate(() => localStorage.getItem('tonewave.profile.v1'))).toBe(saved);
	await page.getByRole('button', { name: 'Remove local reference', exact: true }).click();
	await expect(page.locator('.legend-row').first()).toContainText('CrinEar Reference');
});
