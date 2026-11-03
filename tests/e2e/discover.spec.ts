import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectTradeoffRows } from './tradeoffs.ts';
import { reviewerForReference } from './catalog.ts';

const reference = 'p-437de4e3e3402077cdc3';
const volume = 'p-9104c8bb39d66e906811';
const tuning = 'm-016c491c5c1e659cc5ac';
const like = (productId: string) => ({ productId, rating: 'like', strength: 0.6, soundRelated: true });
const shared = (ids: string[]) =>
	`/?${new URLSearchParams({ ratings: JSON.stringify(ids.map(like)), rig: 'iem-711' })}`;

async function pick(page: Page, model: string, query = model) {
	await page.getByRole('combobox', { name: 'Add an IEM', exact: true }).fill(query);
	await page
		.getByRole('option')
		.filter({ has: page.locator('.option-title').filter({ hasText: new RegExp(`^${model}$`, 'i') }) })
		.click();
	await page.getByRole('combobox', { name: 'Add an IEM', exact: true }).press('Escape');
}
async function accessible(page: Page) {
	const report = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
		.analyze();
	expect(report.violations).toEqual([]);
	expect(report.incomplete.filter((issue) => issue.id === 'aria-prohibited-attr')).toEqual([]);
}
async function settled(page: Page) {
	await expect(page.getByRole('region', { name: 'Measured matches', exact: true })).toHaveAttribute(
		'aria-busy',
		'false'
	);
}

test('unrated additions, real similar matches, exact-rank chart controls, URL migration and pagination', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/');
	await expect(page.locator('.profile-row')).toHaveCount(0);
	await expect(page.locator('.result-row')).toHaveCount(0);
	await pick(page, 'Truthear Hexa', 'trutheear hexa');
	const hexa = page.getByRole('region', { name: 'Truthear Hexa', exact: true });
	await expect(hexa.getByRole('radio', { name: 'Not rated', exact: true })).toBeChecked();
	await expect(page.locator('.result-row')).toHaveCount(0);
	await hexa.getByRole('radio', { name: 'Like', exact: true }).check();
	const first = page.locator('.result-row').first();
	await expect(first).toBeVisible();
	await expect(first.locator('.distance')).toHaveText(/Response distance:\s\d+\.\d\sdB/);
	await expect(page.locator('.results > .distance-note').first()).toContainText('711-family coupler');
	await expect(page.locator('.chart-note').first()).toHaveText(
		'As ranked: smoothed, level-aligned · reviewer offsets corrected.'
	);
	await expect(page).toHaveURL(/ratings=/);
	await first.getByRole('button', { name: 'Show on chart', exact: true }).click();
	await expect(page.locator('.legend-row')).toHaveCount(2);
	const headerJump = page.locator('.results > .section-heading > .chart-jump');
	const rowJump = first.locator('.actions > .chart-jump');
	await expect(headerJump).toHaveCount(1);
	await expect(rowJump).toHaveCount(1);
	if ((page.viewportSize()?.width ?? 0) <= 900) {
		await expect(headerJump).toBeVisible();
		await rowJump.click();
		await expect(page).toHaveURL(/#discover-chart$/);
		await expect(page.getByRole('complementary', { name: 'Reference and match chart' })).toBeInViewport();
	} else {
		await expect(headerJump).toBeHidden();
		await expect(rowJump).toBeHidden();
	}
	await page.locator('.refine > summary').click();
	await page.getByRole('radio', { name: 'Bass', exact: true }).check();
	await expect(page).toHaveURL(/focus=bass/);
	await settled(page);
	await page.reload();
	await expect(hexa.getByRole('radio', { name: 'Like', exact: true })).toBeChecked();
	await page.locator('.refine > summary').click();
	await expect(page.getByRole('radio', { name: 'Bass', exact: true })).toBeChecked();
	await expect(page.locator('.legend-row')).toHaveCount(2);
	await page.getByRole('radio', { name: 'Difference', exact: true }).check();
	await expect(page.getByRole('combobox', { name: 'Difference baseline' })).toHaveValue('reference');
	await first.locator('details:not(.rate-row) > summary').click();
	await expect(first.getByRole('table')).toBeVisible();
	await expect(first.getByText(/Tilt .* dB\/oct/)).toBeVisible();
	await expect(first.locator('.sources a').first()).toHaveAttribute('href', /^https?:\/\//);
	await page.getByRole('switch', { name: 'Regions', exact: true }).check();
	const regions = page.getByRole('group', { name: 'Frequency regions', exact: true }).getByRole('button');
	await expect(regions).toHaveCount(7);
	expect(
		await regions.evaluateAll((buttons) =>
			buttons.every((button) => {
				const range = document.createRange();
				range.selectNodeContents(button);
				const label = range.getBoundingClientRect(),
					target = button.getBoundingClientRect();
				return (
					getComputedStyle(button).writingMode === 'horizontal-tb' &&
					label.left >= target.left &&
					label.right <= target.right
				);
			})
		)
	).toBe(true);
	await expect(page.locator('.result-row')).toHaveCount(20);
	await page.getByRole('button', { name: 'Show more matches', exact: true }).click();
	await expect(page.locator('.result-row')).toHaveCount(40);
	await accessible(page);
	expect(errors).toEqual([]);
});

test('explicit Love and reasoned Dislike persist, explain measured constraints and undo clear', async ({
	page
}) => {
	await page.goto('/');
	await pick(page, 'Truthear Hexa');
	const hexa = page.getByRole('region', { name: 'Truthear Hexa', exact: true });
	await hexa.getByRole('radio', { name: 'Love', exact: true }).check();
	await pick(page, 'Truthear Nova');
	const nova = page.getByRole('region', { name: /^Truthear Nova$/i });
	await expect(nova.getByRole('radio', { name: 'Not rated', exact: true })).toBeChecked();
	await nova.getByRole('radio', { name: 'Dislike', exact: true }).check();
	const reason = 'Lower 20–60 Hz level relative to 80–250 Hz';
	await nova.getByRole('checkbox', { name: reason, exact: true }).check();
	await settled(page);
	await expect(page.locator('.model > summary')).toHaveText('Taste model · 1 centre · limited support');
	await page.locator('.model > summary').click();
	await expect(
		page.getByText(
			"There isn't enough consistent measurement evidence to describe how your liked products differ from typical IEMs in this dataset.",
			{
				exact: true
			}
		)
	).toBeVisible();
	await expect(page.locator('.model')).not.toContainText(
		/population-relative|conservative default profile|positive examples/
	);
	const tasteCurve = page.getByRole('button', { name: '1 Taste 1 centre (derived) Reference', exact: true });
	await expect(tasteCurve).toHaveAttribute('aria-pressed', 'true');
	const first = page.locator('.result-row').first();
	await expect(first.locator('.distance')).toHaveText(/Taste ranking score:\s\d+\.\d\sscore/);
	await first.locator('details:not(.rate-row) > summary').click();
	await expect(first.getByText(/Closest liked product: Truthear Hexa.*dB \(as ranked\)/)).toBeVisible();
	await expect(first.locator('.fit')).toContainText(`${reason}:`);
	await expect(first.locator('.fit')).toContainText(
		/(Higher|Lower|Equal|Insufficient).*measured|Insufficient measured coverage/
	);
	await first.getByRole('button', { name: 'Show on chart', exact: true }).click();
	await expect(page.locator('.legend-row')).toHaveCount(2);
	await page.reload();
	await expect(hexa.getByRole('radio', { name: 'Love', exact: true })).toBeChecked();
	await expect(nova.getByRole('radio', { name: 'Dislike', exact: true })).toBeChecked();
	await nova.locator('summary').click();
	await expect(nova.getByRole('checkbox', { name: reason, exact: true })).toBeChecked();
	await expect(
		page.locator('.result-row').getByRole('heading', { name: /^Truthear (Hexa|Nova)$/i })
	).toHaveCount(0);
	await accessible(page);
	await page.getByRole('button', { name: 'Clear all', exact: true }).click();
	await expect(page.locator('.profile-row')).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(nova.getByRole('radio', { name: 'Dislike', exact: true })).toBeChecked();
});

test('two real references expose trade-offs, per-reference evidence, all compare identities and missing variant support', async ({
	page
}) => {
	await page.goto(shared([reference, volume]));
	await expect(page.locator('.result-row')).toHaveCount(20);
	await expect(page.getByRole('heading', { name: 'Reference trade-offs', exact: true })).toBeVisible();
	await expect(page.locator('.legend-row')).toHaveCount(2);
	const first = page.locator('.result-row').first();
	const referenceNames = ['CrinEar Reference', 'Softears Volume S'];
	await expectTradeoffRows(page, referenceNames, 'mean');
	await first.locator('details:not(.rate-row) > summary').click();
	await expect(
		first.getByRole('table', { name: 'Distance to each reference (dB)', exact: true })
	).toBeVisible();
	for (const name of referenceNames)
		await expect(
			first.getByRole('table', {
				name: `Candidate minus ${name}, after independent level alignment`,
				exact: true
			})
		).toBeVisible();
	await expect(first.getByRole('link', { name: 'Compare', exact: true })).toHaveAttribute(
		'href',
		new RegExp(`${reference}.*${volume}`)
	);
	await page.getByRole('combobox', { name: 'Trade-off sort', exact: true }).selectOption('minimax');
	await expect(page).toHaveURL(/sort=minimax/);
	await settled(page);
	await expectTradeoffRows(page, referenceNames, 'minimax');
	const pareto = page.getByRole('switch', { name: /^Best trade-offs only/ });
	const countLabel = /^Best trade-offs only \((\d+) of (\d+)\)$/;
	await expect(pareto).toHaveAccessibleName(countLabel);
	const counts = countLabel.exec((await pareto.locator('..').innerText()).trim());
	if (!counts) throw new Error('Expected Pareto and candidate counts in the filter label.');
	const paretoCount = Number(counts[1]),
		candidateCount = Number(counts[2]);
	expect(Number.isSafeInteger(paretoCount)).toBe(true);
	expect(Number.isSafeInteger(candidateCount)).toBe(true);
	expect(paretoCount).toBeGreaterThan(0);
	expect(paretoCount).toBeLessThanOrEqual(candidateCount);
	expect(candidateCount).toBeGreaterThanOrEqual(await page.locator('.result-row').count());
	await pareto.check();
	const rows = page.locator('.result-row');
	let shown = Math.min(20, paretoCount);
	await expect(rows).toHaveCount(shown);
	while (shown < paretoCount) {
		await page.getByRole('button', { name: 'Show more matches', exact: true }).click();
		shown = Math.min(shown + 20, paretoCount);
		await expect(rows).toHaveCount(shown);
	}
	await expect(rows).toHaveCount(paretoCount);
	for (const row of await rows.all())
		await expect(row.locator('.tradeoff > p')).toHaveText(
			'Best trade-off · no candidate improves one distance without worsening another'
		);
	await expectTradeoffRows(page, referenceNames, 'minimax');
	await page.getByRole('radio', { name: 'Taste-model view', exact: true }).check();
	await expect(page.getByRole('heading', { name: 'Taste matches', exact: true })).toBeVisible();
	await page.getByRole('radio', { name: 'Reference trade-offs', exact: true }).check();
	const item = page.getByRole('region', { name: 'Softears Volume S', exact: true });
	await item.locator('summary').click();
	await item
		.getByRole('combobox', { name: 'Measurement for Softears Volume S', exact: true })
		.selectOption(tuning);
	await page.locator('.refine > summary').click();
	await page.getByRole('combobox', { name: 'Measurement rig', exact: true }).selectOption('iem-5128');
	await expect(page.locator('.diagnostics')).toContainText(
		'selected variant (High Impedance Setting): not measured on B&K 5128. Available on 711-family coupler.'
	);
	await expect(page.locator('.result-row')).toHaveCount(0);
	await expect(page.locator('.chart-column h2')).toHaveText(
		'This rig doesn’t cover every reference. Choose a rig below.'
	);
	await expect(page.locator('.results')).not.toContainText(
		/p-9104c8bb39d66e906811|m-016c491c5c1e659cc5ac|iem-5128/
	);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.getByRole('button', { name: 'Use 711-family coupler', exact: true }).click();
	await expect(page.locator('.result-row').first()).toBeVisible();
	await expect(
		item.getByRole('combobox', { name: 'Measurement for Softears Volume S', exact: true })
	).toHaveValue(tuning);
	await accessible(page);
});

test('reviewer coverage versus source-only pooling is explicit, shareable and discloses removed sources', async ({
	page
}) => {
	const reviewer = reviewerForReference(reference);
	await page.goto(
		`/?${new URLSearchParams({ ref: reference, rig: reviewer.selectedPartition, sources: reviewer.id })}`
	);
	await expect(page.locator('.result-row').first()).toBeVisible();
	await page.locator('.refine > summary').click();
	const selectedReviewer = (
		await page
			.locator('.source-options label')
			.filter({ has: page.getByRole('checkbox', { checked: true }) })
			.innerText()
	).trim();
	expect(selectedReviewer).toBe(reviewer.name);
	const mode = page.getByRole('combobox', { name: 'Reviewer scoring mode', exact: true });
	await expect(mode).toHaveValue('coverage');
	await mode.selectOption('only');
	await expect(page).toHaveURL(/sourceMode=only/);
	await settled(page);
	const matches = page.locator('.result-row');
	await expect(matches.first()).toBeVisible();
	for (const row of await matches.all()) {
		await expect(row.locator('.reviewers')).toHaveText('Measured by 1 reviewer');
		await expect(row.locator('.sources a')).toHaveText([`${selectedReviewer} database`]);
	}
	await expect(page.getByRole('complementary', { name: 'Reviewer selection caveats' })).toContainText(
		'Unselected source measurements were excluded from reference pooling.'
	);
	await expect(page.getByRole('complementary', { name: 'Reviewer selection caveats' })).toContainText(
		'Unselected source measurements were excluded from candidate pooling.'
	);
	await page.reload();
	await page.locator('.refine > summary').click();
	await expect(mode).toHaveValue('only');
	await page.getByRole('searchbox', { name: 'Search reviewers', exact: true }).fill(reviewer.name);
	await expect(page.locator('.source-options').getByRole('checkbox')).toHaveCount(1);
	await expect(
		page.locator('.source-options').getByRole('checkbox', { name: reviewer.name, exact: true })
	).toBeChecked();
	await page.getByRole('button', { name: 'Reset reviewers', exact: true }).click();
	await expect(page).not.toHaveURL(/sources=/);
	await expect(page.getByRole('searchbox', { name: 'Search reviewers', exact: true })).toHaveValue('');
	await accessible(page);
});

test('row rating drafts keep comfort-only evidence out of ranking and support removal and Undo', async ({
	page
}) => {
	await page.goto(`/?ref=${reference}`);
	const first = page.locator('.result-row').first();
	await expect(first).toBeVisible();
	const name = (await first.getByRole('heading').textContent())?.trim() ?? '';
	await first.locator('.rate-row > summary').click();
	await expect(first.getByRole('button', { name: 'Save rating', exact: true })).toBeDisabled();
	await first.getByRole('radio', { name: 'Dislike', exact: true }).check();
	await first.getByRole('checkbox', { name: 'Fit or comfort, not sound', exact: true }).check();
	await first.getByRole('button', { name: 'Save rating', exact: true }).click();
	const item = page.getByRole('region', { name, exact: true });
	await expect(item.getByRole('radio', { name: 'Dislike', exact: true })).toBeChecked();
	await item.locator('summary').click();
	await expect(item.getByRole('checkbox', { name: 'Fit or comfort, not sound', exact: true })).toBeChecked();
	await expect(page.getByRole('heading', { name: 'Measured matches', exact: true })).toBeVisible();
	await item.getByRole('button', { name: `Remove ${name}`, exact: true }).click();
	await expect(item).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(item.getByRole('radio', { name: 'Dislike', exact: true })).toBeChecked();
	await accessible(page);
});

test('invalid import and unknown references remain errors without overwriting saved data', async ({
	page
}) => {
	await page.goto('/?ref=not-a-real-product');
	await expect(
		page.getByText('A rated reference is not in this form-factor catalog. Remove it or switch form factor.', {
			exact: true
		})
	).toBeVisible();
	await expect(page.locator('.result-row')).toHaveCount(0);
	await page.locator('.workspace-tools > summary').click();
	await page
		.getByLabel('Import profile file')
		.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":2}') });
	await expect(
		page.getByText('Import failed: Expected a Tonewave version 1 or 2 profile with both form factors.', {
			exact: true
		})
	).toBeVisible();
	await expect(page.locator('.profile-row')).toHaveCount(1);
	await accessible(page);
});
