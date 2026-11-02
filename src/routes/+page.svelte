<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/env';
	import { resolve } from '$app/paths';
	import DiscoverySearch from '#lib/components/DiscoverySearch.svelte';
	import FrChart from '#lib/components/FrChart.svelte';
	import Icon from '#lib/components/Icon.svelte';
	let headphones = $derived(browser && page.url.searchParams.get('form') === 'headphones');
	let mode = $state<'similar' | 'profile'>('similar');
</script>

<svelte:head
	><title>Discover — Tonewave Atlas</title><meta
		name="description"
		content="Find IEMs and headphones with a measured response like the ones you already enjoy. Rig-aware comparisons, without invented scores."
	/></svelte:head
>
<div class="page discover">
	<div class="page-heading">
		<p class="eyebrow">A listening atlas, not a leaderboard</p>
		<h1>Find {headphones ? 'headphones' : 'IEMs'} that<br />sound like…</h1>
		<p>Start with something you know. Find what shares its character — and see where it differs.</p>
	</div>
	<div class="discover-grid">
		<section class="discovery-column" aria-label="Discover measured matches">
			<DiscoverySearch {headphones} bind:mode />
			<p class="search-note">Your reference is the starting point. Your ears have the final say.</p>
			{#if mode === 'similar'}<div class="results">
					<div class="section-heading">
						<h2>Similar sound</h2>
						<span class="eyebrow">No reference selected</span>
					</div>
					<div class="empty-state">
						<Icon name="search" size={32} />
						<h3>Start with a familiar sound.</h3>
						<p>
							Search for {headphones ? 'a headphone' : 'an IEM'} to begin. Matches and their measured differences
							will appear here.
						</p>
					</div>
				</div>{/if}
			<div class="principles">
				<div>
					<span class="eyebrow">01 / Evidence</span>
					<p>Real measurements.<br />Clear explanations.</p>
				</div>
				<div>
					<span class="eyebrow">02 / Perspective</span>
					<p>Measurements guide.<br />They don’t decide.</p>
				</div>
			</div>
		</section>
		<aside class="chart-column" aria-label="Reference chart">
			<FrChart />
			<div class="chart-note">
				<Icon name="info" size={16} />
				<p>
					Compare like with like. Matching stays within the same measurement rig family. <a
						href={resolve('/method')}>Why this matters</a
					>
				</p>
			</div>
		</aside>
	</div>
</div>

<style>
	.discover .page-heading {
		margin-bottom: 36px;
	}
	.discover h1 {
		max-width: 700px;
	}
	.discover .page-heading > p:not(.eyebrow) {
		max-width: 46ch;
	}
	.discover-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.08fr);
		align-items: start;
		gap: 64px;
	}
	.search-note {
		font-size: var(--text-xs);
		color: var(--muted);
		margin-top: 12px;
	}
	.results {
		margin-top: 40px;
	}
	.results .section-heading .eyebrow {
		font-size: 9px;
		letter-spacing: 0.04em;
	}
	.chart-column {
		position: sticky;
		top: 24px;
		margin-top: -158px;
	}
	.chart-note {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		margin-top: 16px;
		padding: 0 4px;
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.chart-note :global(svg) {
		margin-top: 2px;
	}
	.chart-note p {
		max-width: 62ch;
	}
	.chart-note a {
		color: var(--muted);
	}
	.principles {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 24px;
		border-top: var(--hairline) solid var(--line);
		padding-top: 24px;
		margin-top: 24px;
	}
	.principles p {
		font-size: var(--text-sm);
		margin-top: 8px;
	}
	@media (max-width: 1150px) {
		.discover-grid {
			gap: 32px;
		}
		.chart-column {
			margin-top: -140px;
		}
	}
	@media (max-width: 900px) {
		.discover-grid {
			grid-template-columns: 1fr;
			gap: 40px;
		}
		.chart-column {
			position: static;
			margin-top: 0;
		}
		.discover .page-heading {
			margin-bottom: 32px;
		}
		.principles {
			display: none;
		}
	}
	@media (max-width: 640px) {
		.results .section-heading {
			align-items: center;
		}
		.results .section-heading .eyebrow {
			white-space: nowrap;
			text-align: right;
		}
		.results {
			margin-top: 32px;
		}
	}
</style>
