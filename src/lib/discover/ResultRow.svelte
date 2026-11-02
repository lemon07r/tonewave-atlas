<script lang="ts">
	import { resolve } from '$app/paths';
	import type { CandidateInfo, SimilarMatch } from '#core/atlas/types.ts';
	import type { BandDistance } from '#core/analysis/distance.ts';
	import type { TasteFit } from '#core/analysis/taste.ts';
	import type { MultiReferenceResult } from '#core/analysis/multi-reference.ts';
	import { dbLabel } from '#lib/chart.ts';
	import { bandLabels, describeBands, distanceExtremes, priceLines, reviewerSummary } from './describe.ts';
	import { reasonLabels } from '#lib/profile/profile.ts';
	import type { WorkspaceItem } from '#lib/profile/profile.ts';
	import PreferenceFields from '#lib/profile/PreferenceFields.svelte';
	import { detail, curveSources, type CurveSource } from './display.ts';
	import Notice from '#lib/components/Notice.svelte';
	import { compareQuery } from './actions.ts';
	let {
		candidate,
		existing,
		rank,
		distance,
		bands,
		match,
		fit,
		nearestLiked,
		referenceProductId,
		selected = false,
		limitReached = false,
		onshow,
		onrate,
		tradeoff,
		referenceNames = [],
		referenceEvidence = [],
		compareReferences,
		nameFor = (id) => id
	}: {
		candidate: CandidateInfo;
		existing?: WorkspaceItem | undefined;
		rank: number;
		distance: number;
		bands: BandDistance[];
		match?: SimilarMatch;
		fit?: TasteFit;
		nearestLiked?: { id: string; distanceDb: number } | null;
		referenceProductId?: string;
		selected?: boolean;
		limitReached?: boolean;
		onshow: () => void;
		onrate?: (item: WorkspaceItem) => void;
		tradeoff?: MultiReferenceResult;
		referenceNames?: string[];
		referenceEvidence?: { label: string; bands: BandDistance[] }[];
		compareReferences?: { productId: string; measurementId?: string }[];
		nameFor?: (id: string) => string;
	} = $props();
	let open = $state<boolean>(false);
	let draft = $derived<WorkspaceItem>(
		existing
			? { ...existing }
			: { productId: candidate.product.id, rating: 'unrated', strength: 0, soundRelated: true }
	);
	let sources = $state.raw<CurveSource[]>([]);
	let error = $state('');
	$effect(() => {
		if (!open) return;
		let current = true;
		void detail(candidate.product.id).then(
			(product) => {
				if (current) {
					sources = curveSources(product, candidate.measurementIds);
					error = '';
				}
			},
			(cause: unknown) => {
				if (current) error = cause instanceof Error ? cause.message : 'Could not load measurement sources.';
			}
		);
		return () => {
			current = false;
		};
	});
	let prices = $derived(priceLines(candidate));
	let extremes = $derived(tradeoff ? distanceExtremes(tradeoff.distances) : []);
	let evidenceTables = $derived(
		referenceEvidence.length ? referenceEvidence : [{ label: fit ? 'taste centre' : 'reference', bands }]
	);
	let formQuery = $derived(candidate.product.form === 'headphone' ? '&form=headphones' : '');
	let matched = $derived(
		bands.filter((b) => b.meanDb !== null && Math.abs(b.meanDb) < 0.75).map((b) => bandLabels[b.band])
	);
</script>

<li class="result-row">
	<div class="row-heading">
		<span class="rank mono">{rank.toString().padStart(2, '0')}</span>
		<h3>
			<span class="result-brand">{candidate.product.brand}</span>
			<span class="result-model">{candidate.product.model}</span>{#if candidate.variantLabel}<span
					class="variant"
				>
					· {candidate.variantLabel}</span
				>{/if}
		</h3>
		<span class="distance mono"
			><span class="sr-only"
				>{fit ? 'Taste ranking score' : tradeoff ? 'Overall distance' : 'Response distance'}:&nbsp;</span
			>{dbLabel(fit ? fit.score : distance)}&nbsp;<span>{fit ? 'score' : 'dB'}</span>{#if fit}<span>
					&nbsp;· <span class="sr-only">Response distance:&nbsp;</span>{dbLabel(fit.plainDistanceDb)} dB</span
				>{/if}</span
		>
	</div>
	{#if match}<p class="reviewers">
			{reviewerSummary(match.perSourceRange, match.sourceCount)}
		</p>{/if}
	{#if !match}<p class="reviewers">
			{reviewerSummary(null, candidate.sources.length)}
		</p>{/if}
	{#if tradeoff}<div class="tradeoff table-scroll">
			<table class="data-table">
				<caption>Distance to each reference (dB)</caption><thead
					><tr
						>{#each referenceNames as name, i (i)}<th scope="col"
								>{name}<span class="extreme">{extremes[i]}</span></th
							>{/each}</tr
					></thead
				><tbody
					><tr
						>{#each tradeoff.distances as value, i (i)}<td>{dbLabel(value)}</td>{/each}</tr
					></tbody
				>
			</table>
			<p>
				{tradeoff.distances.includes(null)
					? 'No trade-off ranking: at least one reference has insufficient overlap'
					: tradeoff.pareto
						? 'Best trade-off · no candidate improves one distance without worsening another'
						: 'Another candidate is at least as close to every reference and closer to one'}
			</p>
		</div>{/if}
	{#if bands.length}<p class="description">
			{describeBands(bands)}{tradeoff ? ` · versus ${referenceNames[0] ?? 'the first reference'}` : ''}
		</p>{/if}
	{#if prices[0]}<p class="price">{prices[0]}</p>{:else}<p class="price">
			Reviewer-listed USD price unavailable
		</p>{/if}
	<div class="actions">
		<button type="button" aria-pressed={selected} disabled={!selected && limitReached} onclick={onshow}
			>{selected ? 'Remove from chart' : 'Show on chart'}</button
		>{#if selected}<a class="chart-jump" href="#discover-chart">View chart</a>{/if}{#if referenceProductId}<a
				href={resolve(`/compare?${compareQuery(candidate, compareReferences ?? referenceProductId)}`)}
				>Compare</a
			>{/if}<a href={resolve(`/explore?product=${encodeURIComponent(candidate.product.id)}${formQuery}`)}
			>Product page</a
		>
	</div>
	{#if onrate}<details class="rate-row">
			<summary>Rate this product</summary>
			<div class="rating-fields">
				<PreferenceFields
					item={draft}
					name={`${candidate.product.brand} ${candidate.product.model}`}
					onchange={(item: WorkspaceItem) => {
						draft = item;
					}}
				/><button
					class="button"
					type="button"
					disabled={draft.rating === 'unrated'}
					onclick={() => {
						onrate({
							...draft,
							productId: candidate.product.id,
							...(candidate.kind === 'tuning' && candidate.measurementIds[0]
								? { measurementId: candidate.measurementIds[0] }
								: {})
						});
					}}>Save rating</button
				>
			</div>
		</details>{/if}
	<details bind:open>
		<summary>Measured differences &amp; sources</summary>
		{#if fit}<div class="fit">
				<p>
					Taste {fit.taste + 1}: ordinary response distance {fit.plainDistanceDb.toFixed(1)} dB; tolerance-weighted
					fit {fit.fit.toFixed(1)} dB. Ranking also considers dislike constraints.
				</p>
				{#if nearestLiked}<p>
						Closest liked product: {nameFor(nearestLiked.id)} · {nearestLiked.distanceDb.toFixed(1)} dB (as ranked).
					</p>{/if}
				<p>Matched bands (mean difference below 0.75 dB): {matched.join(', ') || 'none where measured'}.</p>
				{#each fit.constraints as constraint (`${constraint.disliked}:${constraint.reason}`)}<p>
						{nameFor(constraint.disliked)} — {constraint.reason === 'near-duplicate'
							? 'near-duplicate avoidance'
							: reasonLabels[constraint.reason]}: <strong>{constraint.status}</strong>.
						{constraint.statement.replaceAll(constraint.disliked, nameFor(constraint.disliked))}
					</p>{/each}
				{#each fit.uncertainRegions as region (`${region.low}:${region.high}`)}<p class="muted">
						{region.low}–{region.high} Hz: {region.reason}
					</p>{/each}
			</div>{/if}
		{#if match}<p class="metrics">
				Tilt {dbLabel(match.tilt, true)} dB/oct · Coverage {(match.coverage * 100).toFixed(0)}% · {match.points}
				rank samples
			</p>{/if}
		{#each evidenceTables.filter((evidence) => evidence.bands.length) as evidence, index (index)}<div
				class="table-scroll"
			>
				<table class="data-table">
					<caption>Candidate minus {evidence.label}, after independent level alignment</caption><thead
						><tr
							><th scope="col">Band</th><th scope="col">Mean (dB)</th><th scope="col">RMS (dB)</th><th
								scope="col">Coverage</th
							><th scope="col">Contribution</th></tr
						></thead
					><tbody
						>{#each evidence.bands as band (band.band)}<tr
								><th scope="row">{bandLabels[band.band]}</th><td>{dbLabel(band.meanDb, true)}</td><td
									>{dbLabel(band.rmsDb)}</td
								><td>{(band.coverage * 100).toFixed(0)}%</td><td>{(band.contribution * 100).toFixed(0)}%</td
								></tr
							>{/each}</tbody
					>
				</table>
			</div>{/each}
		{#if error}<Notice kind="caution">{error}</Notice>{/if}
		{#if prices.length > 1}<h4>All reviewer-listed USD prices</h4>
			{#each prices.slice(1) as price (price)}<p class="price-listing">{price}</p>{/each}{/if}
		<ul class="sources">
			{#each sources as source (source.url)}<li>
					<a href={source.url} target="_blank" rel="external noreferrer">{source.label} database</a>
				</li>{/each}{#if !sources.length}{#each candidate.sources as source (source.id)}<li>
						<a href={source.url} target="_blank" rel="external noreferrer">{source.name} database</a>
					</li>{/each}{/if}
		</ul>
	</details>
</li>

<style>
	.price-listing {
		margin-block: 8px;
		color: var(--muted);
	}
	.rating-fields {
		display: grid;
		gap: 12px;
		padding-block: 12px;
	}
	.rating-fields > button {
		justify-self: start;
	}
	.tradeoff {
		margin: 12px 0 0 34px;
		font-size: var(--text-xs);
	}
	.tradeoff p {
		color: var(--muted);
		padding-top: 8px;
	}
	.result-row {
		list-style: none;
		border-top: var(--hairline) solid var(--line);
		padding: 20px 0;
		min-height: 160px;
	}
	.row-heading {
		display: grid;
		grid-template-columns: 24px minmax(0, 1fr) auto;
		gap: 10px;
		align-items: baseline;
	}
	h3 {
		font-size: var(--text-base);
		font-weight: 550;
		line-height: 1.4;
	}
	.rank {
		font-size: 11px;
		color: var(--muted);
	}
	.variant {
		font-weight: 400;
	}
	.distance {
		font-size: 18px;
		text-align: right;
	}
	.distance span {
		font-size: 12px;
	}
	.description,
	.reviewers,
	.price,
	.metrics,
	.fit p {
		font-size: var(--text-xs);
		margin: 8px 0 0 34px;
	}
	.reviewers,
	.price {
		color: var(--muted);
	}
	.actions {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
		align-items: center;
		margin: 8px 0 0 34px;
		font-size: var(--text-xs);
	}
	.actions button {
		padding: 4px 0;
		border: 0;
		background: none;
		color: var(--accent);
		min-height: 36px;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.actions > a,
	.actions > button {
		display: inline-flex;
		align-items: center;
		min-block-size: 36px;
		min-inline-size: 24px;
		white-space: nowrap;
	}
	.actions button:disabled {
		color: var(--muted);
		cursor: not-allowed;
	}
	.actions > .chart-jump {
		display: none;
	}
	details {
		margin-left: 34px;
		font-size: var(--text-xs);
	}
	summary {
		min-height: 36px;
		padding: 8px 0;
		color: var(--muted);
		cursor: pointer;
	}
	.table-scroll {
		overflow-x: auto;
	}
	caption {
		text-align: left;
		padding: 12px 0;
		color: var(--muted);
	}
	.data-table {
		font-size: var(--text-xs);
	}
	.data-table th {
		letter-spacing: normal;
		font-kerning: normal;
	}
	.data-table th,
	.data-table td {
		padding: 8px 6px;
	}
	.tradeoff th,
	.tradeoff td {
		text-align: right;
		vertical-align: top;
		font-variant-numeric: tabular-nums;
	}
	.extreme {
		display: block;
		font-weight: 400;
		min-height: 1.5em;
	}
	.metrics,
	.fit p {
		margin-left: 0;
	}
	.sources {
		margin: 12px 0 0;
		padding-left: 16px;
	}
	.sources a {
		display: inline-flex;
		align-items: center;
		min-block-size: 28px;
		min-inline-size: 24px;
	}
	@media (max-width: 900px) {
		.actions > .chart-jump {
			display: inline-flex;
		}
	}
	@media (max-width: 640px) {
		.row-heading {
			grid-template-columns: 20px minmax(0, 1fr) auto;
			gap: 8px;
		}
		.description,
		.reviewers,
		.price,
		.actions,
		details {
			margin-left: 28px;
		}
		.distance {
			font-size: 16px;
		}
		h3 {
			font-size: 14px;
		}
	}
</style>
