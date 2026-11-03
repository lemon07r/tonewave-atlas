import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectTradeoffRows } from './tradeoffs.ts';
import { measurementReviewer, measurementsForProduct, reviewerForReference } from './catalog.ts';

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
	await expect(page.locator('.method-sentence')).toContainText('on 711-family coupler');
	await expect(page.locator('.results > .distance-note').first()).toHaveText(
		'Distance in dB · lower is closer, not better · All eligible reviewers'
	);
	await expect(page.locator('.chart-note').first()).toHaveText(
		'As ranked: smoothed, level-aligned · reviewer offsets corrected.'
	);
	await expect(page).toHaveURL(/ratings=/);
	await first.getByRole('button', { name: /^Show on chart: .+/ }).click();
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
	if ((page.viewportSize()?.width ?? 0) <= 640) {
		const evidence = first.getByRole('region', { name: 'Band differences versus reference', exact: true });
		await evidence.focus();
		await evidence.press('ArrowRight');
		await expect.poll(() => evidence.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
	}
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
	await first.getByRole('button', { name: /^Show on chart: .+/ }).click();
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
	await expect(first.getByRole('link', { name: /^Compare .+/ })).toHaveAttribute(
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
		.getByRole('combobox', { name: 'Reviewer for Softears Volume S', exact: true })
		.selectOption(measurementReviewer(tuning));
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
	await first.getByRole('button', { name: /^More rating options for .+/ }).click();
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

test('quick Like moves similar matches to compare, explains deterministic rank changes and supports Undo', async ({
	page
}) => {
	await page.goto(shared([reference]));
	const rows = page.locator('.result-row');
	await expect(rows).toHaveCount(20);
	await settled(page);
	await expect(page.locator('.rank-change')).toHaveCount(0);
	const before = await rows.evaluateAll((elements) =>
		elements.map((element) => element.getAttribute('data-product-id'))
	);
	const picked = rows.nth(3);
	const productId = await picked.getAttribute('data-product-id');
	const name = (await picked.getByRole('heading').innerText()).replace(/\s+/g, ' ').trim();
	await picked.getByRole('button', { name: `Like ${name}`, exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Reference trade-offs', exact: true })).toBeVisible();
	await settled(page);
	await expect(page.locator('.profile-row')).toHaveCount(2);
	await expect(
		page.getByRole('region', { name, exact: true }).getByRole('radio', { name: 'Like', exact: true })
	).toBeChecked();
	await expect(page.locator('.method-sentence')).toHaveText(
		'Products that balance your 2 liked references (mean/worst-case) on 711-family coupler'
	);
	expect(
		await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-product-id')))
	).not.toContain(productId);
	let added = 0,
		moved = 0;
	for (const [index, row] of (await rows.all()).entries()) {
		const id = await row.getAttribute('data-product-id');
		const previous = before.indexOf(id);
		if (previous === -1) {
			added++;
			await expect(row.locator('.rank-change')).toHaveText('New');
		} else if (previous !== index) {
			moved++;
			const delta = previous - index;
			await expect(row.locator('.rank-change')).toHaveText(`${delta > 0 ? '↑' : '↓'}${Math.abs(delta)}`);
		} else await expect(row.locator('.rank-change')).toHaveCount(0);
	}
	expect(added + moved).toBeGreaterThan(0);
	await expect(page.locator('.update-slot > [role="status"]')).toHaveText(
		`${added} new matches, ${moved} moved`
	);
	await accessible(page);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.locator('.profile-row')).toHaveCount(1);
	await expect(page.getByRole('heading', { name: 'Measured matches', exact: true })).toBeVisible();
	await settled(page);
	await expect(
		page
			.locator(`.result-row[data-product-id="${productId}"]`)
			.getByRole('button', { name: `Like ${name}`, exact: true })
	).toHaveAttribute('aria-pressed', 'false');
});

async function installRankingGate(page: Page) {
	await page.addInitScript(() => {
		const pending: (() => void)[] = [];
		Object.assign(window, {
			rankingGate: {
				pending,
				release: () => {
					document.documentElement.dataset.holdRanking = 'false';
					for (const send of pending.splice(0)) send();
				}
			}
		});
		// eslint-disable-next-line @typescript-eslint/unbound-method -- called with the original port receiver.
		const post = MessagePort.prototype.postMessage;
		MessagePort.prototype.postMessage = function (
			message: unknown,
			transfer?: Transferable[] | StructuredSerializeOptions
		) {
			const options = Array.isArray(transfer) ? { transfer } : transfer;
			const path = message && typeof message === 'object' && 'path' in message ? message.path : [];
			if (
				document.documentElement.dataset.holdRanking === 'true' &&
				Array.isArray(path) &&
				['similar', 'compare', 'taste'].includes(String(path[0]))
			)
				pending.push(() => {
					post.call(this, message, options);
				});
			else post.call(this, message, options);
		};
	});
}

for (const order of ['filter then rating', 'rating then filter']) {
	test(`coalesced ${order} does not attribute ranking-context movement to quick Like`, async ({ page }) => {
		await installRankingGate(page);
		await page.goto(shared([reference]));
		await expect(page.locator('.result-row')).toHaveCount(20);
		await settled(page);
		await page.locator('.refine > summary').click();
		const first = page.locator('.result-row').first();
		const name = (await first.getByRole('heading').innerText()).replace(/\s+/g, ' ').trim();
		await page.evaluate(() => {
			document.documentElement.dataset.holdRanking = 'true';
		});
		const filter = () =>
			page.getByRole('combobox', { name: 'At least N reviewers', exact: true }).selectOption('3');
		const rate = () => first.getByRole('button', { name: `Like ${name}`, exact: true }).click();
		const actions = order === 'filter then rating' ? [filter, rate] : [rate, filter];
		for (const [index, action] of actions.entries()) {
			await action();
			await expect
				.poll(() =>
					page.evaluate(
						() => (window as unknown as { rankingGate: { pending: unknown[] } }).rankingGate.pending.length
					)
				)
				.toBe(index + 1);
		}
		await page.evaluate(() => {
			(window as unknown as { rankingGate: { release: () => void } }).rankingGate.release();
		});
		await expect(page.getByRole('heading', { name: 'Reference trade-offs', exact: true })).toBeVisible();
		await settled(page);
		await expect(page).toHaveURL(/minReviewers=3/);
		await expect(page.locator('.profile-row')).toHaveCount(2);
		await expect(page.locator('.rank-change')).toHaveCount(0);
		await expect(page.locator('.update-slot > [role="status"]')).toHaveText('');
	});
}

for (const moveElsewhere of [false, true]) {
	test(`keyboard quick Like ${moveElsewhere ? 'keeps focus moved elsewhere while matching' : 'moves removed action focus to the new workspace reference'}`, async ({
		page
	}) => {
		await installRankingGate(page);
		await page.goto(shared([reference]));
		await expect(page.locator('.result-row')).toHaveCount(20);
		await settled(page);
		const row = page.locator('.result-row').first();
		const productId = await row.getAttribute('data-product-id');
		const name = (await row.getByRole('heading').innerText()).replace(/\s+/g, ' ').trim();
		const button = row.getByRole('button', { name: `Like ${name}`, exact: true });
		await page.evaluate(() => {
			document.documentElement.dataset.holdRanking = 'true';
		});
		await button.focus();
		await expect(button).toBeFocused();
		await button.press('Enter');
		await expect
			.poll(() =>
				page.evaluate(
					() => (window as unknown as { rankingGate: { pending: unknown[] } }).rankingGate.pending.length
				)
			)
			.toBe(1);
		const search = page.getByRole('combobox', { name: 'Add an IEM', exact: true });
		if (moveElsewhere) await search.focus();
		else await expect(button).toBeFocused();
		await page.evaluate(() => {
			(window as unknown as { rankingGate: { release: () => void } }).rankingGate.release();
		});
		await expect(page.getByRole('heading', { name: 'Reference trade-offs', exact: true })).toBeVisible();
		await settled(page);
		await expect(page.locator(`.result-row[data-product-id="${productId}"]`)).toHaveCount(0);
		if (moveElsewhere) await expect(search).toBeFocused();
		else
			await expect(
				page.getByRole('region', { name, exact: true }).getByRole('radio', { name: 'Like', exact: true })
			).toBeFocused();
	});
}

test('Hexa measurement selection narrows by reviewer, restores exact measurements and retains another-rig selection', async ({
	page
}) => {
	const hexaId = 'p-19d1654fcb150bf1aa2f';
	await page.goto(shared([hexaId]));
	await expect(page.locator('.result-row')).toHaveCount(20);
	const hexa = page.getByRole('region', { name: 'Truthear Hexa', exact: true });
	await hexa.locator('details > summary').click();
	const reviewer = hexa.getByRole('combobox', { name: 'Reviewer for Truthear Hexa', exact: true });
	const measurement = hexa.getByRole('combobox', { name: 'Measurement for Truthear Hexa', exact: true });
	await expect(reviewer).toHaveValue('');
	await expect(reviewer.locator('option').first()).toHaveText('Consensus of all reviewers (recommended)');
	await expect(measurement).toHaveCount(0);
	const all = measurementsForProduct(hexaId);
	expect(all.length).toBeGreaterThan(100);
	const eligible = all.filter((entry) => entry.partition === 'iem-711');
	const reviewerId = [...new Set(eligible.map((entry) => entry.sourceId))].sort(
		(a, b) =>
			eligible.filter((entry) => entry.sourceId === b).length -
				eligible.filter((entry) => entry.sourceId === a).length || a.localeCompare(b)
	)[0];
	const choices = eligible.filter((entry) => entry.sourceId === reviewerId);
	const selected = choices.find((entry) => entry.variant.kind !== 'default') ?? choices[0];
	if (!reviewerId || !selected) throw new Error('Hexa needs eligible reviewer measurements.');
	await expect(reviewer.locator(`option[value="${reviewerId}"]`)).toContainText(
		`${choices.length} measurements · 711-family coupler`
	);
	const href = page.url();
	await reviewer.selectOption(reviewerId);
	await expect(page).toHaveURL(href);
	await expect(measurement.locator('option')).toHaveCount(choices.length + 1);
	expect(choices.length).toBeLessThan(all.length);
	await measurement.selectOption(selected.id);
	await expect(page).toHaveURL(new RegExp(selected.id));
	await settled(page);
	await page.reload();
	await hexa.locator('details > summary').click();
	await expect(reviewer).toHaveValue(reviewerId);
	await expect(measurement).toHaveValue(selected.id);
	await page.locator('.refine > summary').click();
	await page.getByRole('combobox', { name: 'Measurement rig', exact: true }).selectOption('iem-5128');
	await expect(page).toHaveURL(/rig=iem-5128/);
	await settled(page);
	await expect(measurement).toHaveValue(selected.id);
	await expect(reviewer.locator(`option[value="${reviewerId}"]`)).toContainText('711-family coupler');
	await reviewer.selectOption('');
	await expect(page).not.toHaveURL(new RegExp(selected.id));
	await expect(measurement).toHaveCount(0);
	await accessible(page);
});

test('updating notice never pushes the previous first result, with readable type and accessible targets', async ({
	page
}) => {
	await page.goto(shared([reference]));
	await expect(page.locator('.result-row')).toHaveCount(20);
	await settled(page);
	if ((page.viewportSize()?.width ?? 0) === 1440) {
		const firstTop = await page
			.locator('.result-row')
			.first()
			.evaluate((element) => element.getBoundingClientRect().top);
		expect(firstTop).toBeLessThan(700);
	}
	const minFont = (page.viewportSize()?.width ?? 0) <= 640 ? 14 : 13;
	const fontSizes = await page
		.locator(
			'.reviewers, .distance-note, .chart-note, .result-brand, .rank, .legend-row button, .reference-label, .legend-value, .fr-chart figcaption, .profile-row summary, .workspace-options summary'
		)
		.evaluateAll((elements) =>
			elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize))
		);
	expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(minFont);
	const targets = await page
		.locator(
			'.result-row button, .result-row a, .result-row summary, .profile-row input[type="radio"], .fr-chart button, .fr-chart a, .chart-panel summary, .chart-panel select, .chart-panel input[type="radio"]'
		)
		.evaluateAll((elements) =>
			elements
				.filter((element) => element.checkVisibility())
				.map((element) => {
					const box = element.getBoundingClientRect();
					return {
						label:
							element.textContent.trim() ||
							element.getAttribute('aria-label') ||
							element.getAttribute('value'),
						width: box.width,
						height: box.height
					};
				})
		);
	for (const target of targets) {
		expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(24);
		expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(24);
	}
	await page.locator('.refine > summary').click();
	await page.evaluate(() => {
		const first = document.querySelector('.result-row');
		if (!first) throw new Error('Missing first result');
		const box = () => {
			const rect = first.getBoundingClientRect();
			return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
		};
		const captured = { before: box(), during: [] as ReturnType<typeof box>[] };
		Object.assign(window, { updatePositions: captured });
		const observer = new MutationObserver(() => {
			if (document.querySelector('.updating')) captured.during.push(box());
			else if (captured.during.length) observer.disconnect();
		});
		observer.observe(document.querySelector('.results') ?? document.body, { childList: true, subtree: true });
	});
	await page.getByRole('radio', { name: 'Bass', exact: true }).check();
	await expect(page).toHaveURL(/focus=bass/);
	await settled(page);
	const positions = await page.evaluate(
		() =>
			(
				window as unknown as {
					updatePositions: {
						before: { x: number; y: number; width: number; height: number };
						during: { x: number; y: number; width: number; height: number }[];
					};
				}
			).updatePositions
	);
	expect(positions.during.length).toBeGreaterThan(0);
	for (const box of positions.during)
		for (const dimension of ['x', 'y', 'width', 'height'] as const)
			expect(box[dimension]).toBeCloseTo(positions.before[dimension], 1);
	await expect(page.locator('.rank-change')).toHaveCount(0);
});

test('mods and minimum reviewers re-rank, persist in the URL and expose reviewer sensitivity honestly', async ({
	page
}) => {
	await page.goto(shared([reference]));
	await expect(page.locator('.result-row')).toHaveCount(20);
	await expect(page.locator('.rank-range').first()).toBeVisible();
	const prototype = page.locator('.result-row[data-product-id="p-5a52facdf723156777d5"]');
	await expect(prototype).toHaveCount(0);
	await page.locator('.refine > summary').click();
	const modified = page.getByRole('checkbox', { name: 'Include mods & prototypes', exact: true });
	const minimum = page.getByRole('combobox', { name: 'At least N reviewers', exact: true });
	await expect(modified).not.toBeChecked();
	await expect(minimum).toHaveValue('1');
	await modified.check();
	await expect(page).toHaveURL(/modified=1/);
	await expect(prototype).toBeVisible();
	await expect(prototype.locator('.related-reference')).toHaveText('· Variant of CrinEar Reference');
	await minimum.selectOption('3');
	await expect(page).toHaveURL(/minReviewers=3/);
	await settled(page);
	await expect(prototype).toHaveCount(0);
	await page.reload();
	await expect(page.locator('.result-row')).toHaveCount(20);
	await page.locator('.refine > summary').click();
	await expect(modified).toBeChecked();
	await expect(minimum).toHaveValue('3');
	await minimum.selectOption('1');
	await modified.uncheck();
	await expect(page).not.toHaveURL(/modified=|minReviewers=/);
	await accessible(page);
});

test('failed analysis worker initialization leaves a retryable catalog error, not endless loading', async ({
	page
}) => {
	await page.addInitScript(() => {
		const NativeWorker = window.Worker;
		let failed = false;
		window.Worker = class extends NativeWorker {
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				if (!failed) {
					failed = true;
					queueMicrotask(() => this.dispatchEvent(new Event('error', { cancelable: true })));
				}
			}
		};
	});
	await page.goto(shared([reference]));
	await expect(page.getByText(/Catalog unavailable: Analysis worker failed to load/)).toBeVisible();
	await expect(page.getByRole('combobox', { name: 'Add an IEM', exact: true })).not.toHaveAttribute(
		'aria-busy',
		'true'
	);
	await page.getByRole('button', { name: 'Retry catalog', exact: true }).click();
	await expect(page.locator('.result-row')).toHaveCount(20);
	await expect(page.getByRole('button', { name: 'Retry catalog', exact: true })).toHaveCount(0);
});

test('Back and Forward keep URL taste corrections authoritative; only explicit model switches restore drafts', async ({
	page
}) => {
	const params = new URLSearchParams({
		ratings: JSON.stringify([like(reference), like(volume)]),
		rig: 'iem-711',
		view: 'taste',
		edits: JSON.stringify([{ tasteId: 0, bands: { bass: 1 } }])
	});
	await page.goto(`/?${params}`);
	await expect(page.locator('.result-row')).toHaveCount(20);
	await page.locator('.refine > summary').click();
	await page.getByText('Adjust derived taste centres', { exact: true }).click();
	const bass = page.getByRole('spinbutton', { name: 'Taste 1 bass, numeric value', exact: true });
	await expect(bass).toHaveValue('1');
	await bass.fill('1.5');
	await bass.press('Tab');
	await expect
		.poll(() => new URL(page.url()).searchParams.get('edits'))
		.toBe(JSON.stringify([{ tasteId: 0, bands: { bass: 1.5 } }]));
	const earlier = page.url();
	params.set('edits', JSON.stringify([{ tasteId: 0, bands: { bass: 0.5 } }]));
	// A normal same-route link adds a SvelteKit history entry without replacing the component.
	await page.evaluate((href) => {
		const link = document.createElement('a');
		link.href = href;
		link.textContent = 'Earlier correction';
		document.body.append(link);
		link.click();
		link.remove();
	}, `/?${params}`);
	await expect(bass).toHaveValue('0.5');
	const later = page.url();
	await page.goBack();
	await expect(page).toHaveURL(earlier);
	await expect(bass).toHaveValue('1.5');
	await page.goForward();
	await expect(page).toHaveURL(later);
	await expect(bass).toHaveValue('0.5');
	const rig = page.getByRole('combobox', { name: 'Measurement rig', exact: true });
	await rig.selectOption('iem-5128');
	await expect(page).not.toHaveURL(/edits=/);
	await settled(page);
	await rig.selectOption('iem-711');
	await expect(bass).toHaveValue('0.5');
	await expect
		.poll(() => new URL(page.url()).searchParams.get('edits'))
		.toBe(JSON.stringify([{ tasteId: 0, bands: { bass: 0.5 } }]));
});

test('single-reference rig failures offer automatic selection without claiming all alternatives were searched', async ({
	page
}) => {
	await page.goto(`/?${new URLSearchParams({ ref: volume, m: tuning, rig: 'iem-5128' })}`);
	await expect(page.locator('.chart-column h2')).toHaveText(
		'This reference isn’t measured on the selected rig. Try automatic rig.'
	);
	await expect(page.locator('.result-row')).toHaveCount(0);
	await expect(
		page.getByText('No rig covers every reference. Change a reference or variant.', { exact: true })
	).toHaveCount(0);
	await page.getByRole('button', { name: 'Use automatic rig', exact: true }).click();
	await expect(page).not.toHaveURL(/rig=/);
	await expect(page).toHaveURL(new RegExp(tuning));
	await expect(page.locator('.result-row')).toHaveCount(20);
});

test('result actions share one line on desktop and tablet, with product-specific names and grouped mobile links', async ({
	page
}) => {
	await page.goto(shared([reference]));
	const first = page.locator('.result-row').first();
	await expect(first).toBeVisible();
	const name = (await first.getByRole('heading').innerText()).replace(/\s+/g, ' ').trim();
	for (const action of [
		`Show on chart: ${name}`,
		`Like ${name}`,
		`Dislike ${name}`,
		`More rating options for ${name}`
	])
		await expect(first.getByRole('button', { name: action, exact: true })).toBeVisible();
	await expect(first.getByRole('link', { name: `Compare ${name}`, exact: true })).toBeVisible();
	await expect(first.getByRole('link', { name: `Product page for ${name}`, exact: true })).toBeVisible();
	const actions = await first
		.locator('.actions > button, .quick-rating button, .action-links a')
		.evaluateAll((elements) =>
			elements.map((element) => {
				const box = element.getBoundingClientRect();
				return { top: box.top, width: box.width, height: box.height };
			})
		);
	expect(actions).toHaveLength(6);
	for (const action of actions) {
		expect(action.width).toBeGreaterThanOrEqual(24);
		expect(action.height).toBeGreaterThanOrEqual(24);
	}
	if ((page.viewportSize()?.width ?? 0) > 640)
		expect(
			Math.max(...actions.map((action) => action.top)) - Math.min(...actions.map((action) => action.top))
		).toBeLessThan(1);
	expect(actions[4]?.top).toBe(actions[5]?.top);
	const more = first.getByRole('button', { name: `More rating options for ${name}`, exact: true });
	await expect(more).toHaveAttribute('aria-expanded', 'false');
	await more.click();
	await expect(more).toHaveAttribute('aria-expanded', 'true');
	await expect(first.getByRole('button', { name: 'Save rating', exact: true })).toBeVisible();
	await more.click();
	await expect(first.getByRole('button', { name: 'Save rating', exact: true })).toBeHidden();
	await accessible(page);
});

test('charting a match redraws the chart without re-ranking the results', async ({ page }) => {
	await page.goto(shared([reference]));
	await expect(page.locator('.result-row')).toHaveCount(20);
	await settled(page);
	await page.evaluate(() => {
		const seen = { updating: false };
		Object.assign(window, { rerank: seen });
		new MutationObserver(() => {
			if (document.querySelector('.updating')) seen.updating = true;
		}).observe(document.body, { childList: true, subtree: true });
	});
	await page
		.locator('.result-row')
		.first()
		.getByRole('button', { name: /^Show on chart: .+/ })
		.click();
	await expect(page).toHaveURL(/chart=/);
	await expect(page.locator('.legend-row')).toHaveCount(2);
	await page
		.locator('.result-row')
		.nth(1)
		.getByRole('button', { name: /^Show on chart: .+/ })
		.click();
	await expect(page.locator('.legend-row')).toHaveCount(3);
	await page.waitForTimeout(500);
	expect(
		await page.evaluate(() => (window as unknown as { rerank: { updating: boolean } }).rerank.updating)
	).toBe(false);
	await settled(page);
});
