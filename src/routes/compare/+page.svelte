<script lang="ts">
	import { browser, dev } from '$app/env';
	import { page } from '$app/state';
	import VisualHarness from '#lib/dev/VisualHarness.svelte';
	import SearchCombobox from '#lib/components/SearchCombobox.svelte';
	import FrChart from '#lib/components/FrChart.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Disclosure from '#lib/components/Disclosure.svelte';
	import Notice from '#lib/components/Notice.svelte';
</script>

<svelte:head
	><title>Compare — Tonewave Atlas</title><meta
		name="description"
		content="Compare frequency-response curves, inspect differences and see measurement uncertainty."
	/></svelte:head
>
{#if dev && browser && page.url.searchParams.has('visual')}
	<VisualHarness />
{:else}
	<div class="page">
		<div class="page-heading">
			<p class="eyebrow">Look closer. Listen for yourself.</p>
			<h1>Compare responses.</h1>
			<p>Put measurements side by side. Inspect the differences without turning a curve into a verdict.</p>
		</div>
		<div class="compare-grid">
			<section class="selection" aria-label="Comparison selection">
				<SearchCombobox
					items={[]}
					label="Add to comparison"
					placeholder="Brand or model"
					shortcut
					emptyText="The catalog is not connected yet. No measurements are available to add."
					onselect={() => {}}
				/>
				<div class="selection-heading">
					<span class="eyebrow">Selected curves</span><span class="mono small muted">0 / 6</span>
				</div>
				<div class="empty-state">
					<Icon name="plus" size={28} />
					<h3>A little perspective helps.</h3>
					<p>Add a product to begin. You can compare up to six curves from the same rig family.</p>
				</div>
				<Disclosure label="Display & alignment"
					><p class="small muted">
						Smoothing, level alignment and rig selection will be available when measurements are loaded.
						Curves are never extrapolated beyond the measured range.
					</p></Disclosure
				><Notice kind="caution"
					>A measurement is not an ear. Fit, seal and insertion depth can change what you hear, especially in
					the treble.</Notice
				>
			</section>
			<div class="chart">
				<FrChart title="Comparison workspace" />
				<p class="small muted chart-caption">
					No measurements selected. Add a product to inspect its response.
				</p>
			</div>
		</div>
	</div>
{/if}

<style>
	.compare-grid {
		display: grid;
		grid-template-columns: 300px minmax(0, 1fr);
		gap: 48px;
		align-items: start;
	}
	.selection-heading {
		display: flex;
		justify-content: space-between;
		margin-top: 32px;
		padding-bottom: 12px;
		border-bottom: var(--hairline) solid var(--line);
	}
	.selection .empty-state {
		padding: 32px 12px;
	}
	.selection :global(.notice) {
		margin-top: 20px;
	}
	.chart-caption {
		margin-top: 16px;
	}
	.chart :global(.plot) {
		height: 364px;
	}
	@media (max-width: 1050px) {
		.compare-grid {
			grid-template-columns: 240px minmax(0, 1fr);
			gap: 28px;
		}
	}
	@media (max-width: 900px) {
		.compare-grid {
			grid-template-columns: 1fr;
		}
		.selection .empty-state {
			padding: 24px;
		}
		.selection :global(.notice) {
			display: none;
		}
		.chart :global(.plot) {
			height: 300px;
		}
	}
	@media (max-width: 640px) {
		.chart :global(.plot) {
			height: 244px;
		}
	}
</style>
