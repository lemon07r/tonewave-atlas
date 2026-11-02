<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/env';
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
	<div class="discover-grid">
		<section class="discovery-column" aria-label="Discover measured matches">
			<div class="page-heading">
				<p class="eyebrow">A listening atlas, not a leaderboard</p>
				<h1>Find {headphones ? 'headphones' : 'IEMs'} that<br />sound like…</h1>
				<p>Start with something you know. Find what shares its character — and see where it differs.</p>
			</div>
			<DiscoverySearch {headphones} bind:mode />
			{#if mode === 'similar'}<div class="results">
					<div class="section-heading">
						<h2>Similar sound</h2>
						<span class="eyebrow">No reference selected</span>
					</div>
					<div class="empty-state">
						<Icon name="search" size={32} />
						<h3>Choose {headphones ? 'a headphone' : 'an IEM'} to begin.</h3>
						<p>Measured matches and their differences will appear here.</p>
					</div>
				</div>{/if}
		</section>
		<aside class="chart-column" aria-label="Reference chart">
			<FrChart
				emptyText={`No curve yet — pick ${headphones ? 'a headphone' : 'an IEM'} to see its measured response.`}
			/>
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
	}
	@media (max-width: 1150px) {
		.discover-grid {
			gap: 32px;
		}
	}
	@media (max-width: 900px) {
		.discover-grid {
			grid-template-columns: 1fr;
			gap: 40px;
		}
		.chart-column {
			position: static;
		}
		.discover .page-heading {
			margin-bottom: 32px;
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
