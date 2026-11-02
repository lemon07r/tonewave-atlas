<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/env';
	import SearchCombobox from '#lib/components/SearchCombobox.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Notice from '#lib/components/Notice.svelte';
	import Disclosure from '#lib/components/Disclosure.svelte';
	let headphones = $derived(browser && page.url.searchParams.get('form') === 'headphones');
</script>

<svelte:head
	><title>Explore — Tonewave Atlas</title><meta
		name="description"
		content="Explore IEM and headphone measurements, with source attribution, variants and rig details."
	/></svelte:head
>
<div class="page">
	<div class="page-heading">
		<p class="eyebrow">Follow the evidence</p>
		<h1>A catalog of measured sound.</h1>
		<p>Find a product. See its measurements, variants and sources — including the places they don’t agree.</p>
	</div>
	<div class="explore-grid">
		<aside aria-label="Catalog filters">
			<p class="eyebrow filter-title">Refine the view</p>
			<div class="filter">
				<label class="field-label" for="rig-filter">Measurement rig</label><select id="rig-filter" disabled
					><option>All rig families</option></select
				>
				<p>Comparisons stay within one family.</p>
			</div>
			<div class="filter">
				<label class="field-label" for="source-filter">Source</label><select id="source-filter" disabled
					><option>All sources</option></select
				>
			</div>
			<Disclosure label="More filters"
				><p class="small muted">
					Budget, variant and brand filters will be available when the measurement catalog is connected.
				</p></Disclosure
			>
		</aside>
		<section aria-label="Product catalog">
			<SearchCombobox
				items={[]}
				label={`Search ${headphones ? 'headphones' : 'IEMs'}`}
				placeholder="Search by brand or model"
				shortcut
				emptyText="No catalog is connected yet. There are no products to search."
				onselect={() => {}}
			/>
			<div class="catalog-heading">
				<h2>{headphones ? 'Headphones' : 'In-ear monitors'}</h2>
				<span class="eyebrow">Catalog not connected</span>
			</div>
			<div class="empty-state catalog-empty">
				<Icon name="catalog" size={36} />
				<h3>The atlas starts with evidence.</h3>
				<p>
					No measurements are loaded in this preview. When the catalog is connected, products will appear here
					with their sources and rig details.
				</p>
			</div>
			<Notice title="No cherry-picked curves"
				>A product may have several measurements. We keep their provenance and show disagreement instead of
				choosing whichever looks best.</Notice
			>
		</section>
	</div>
</div>

<style>
	.explore-grid {
		display: grid;
		grid-template-columns: 228px minmax(0, 1fr);
		gap: 64px;
	}
	.filter-title {
		margin-bottom: 24px;
	}
	.filter {
		margin-bottom: 24px;
	}
	.filter select {
		width: 100%;
		font-size: var(--text-sm);
	}
	.filter p {
		margin-top: 8px;
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.catalog-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		padding: 28px 0 16px;
		border-bottom: var(--hairline) solid var(--line);
	}
	.catalog-heading h2 {
		font-size: var(--text-lg);
	}
	.catalog-heading .eyebrow {
		font-size: 10px;
	}
	.catalog-empty {
		min-height: 300px;
	}
	.catalog-empty p {
		max-width: 44ch;
	}
	@media (max-width: 1050px) {
		.explore-grid {
			gap: 32px;
			grid-template-columns: 200px minmax(0, 1fr);
		}
	}
	@media (max-width: 700px) {
		.explore-grid {
			display: flex;
			flex-direction: column-reverse;
			gap: 32px;
		}
		.explore-grid > * {
			width: 100%;
		}
		.explore-grid aside {
			border-top: var(--hairline) solid var(--line);
			padding-top: 24px;
		}
		.catalog-heading {
			align-items: baseline;
		}
		.catalog-heading .eyebrow {
			max-width: 13ch;
			text-align: right;
		}
		.catalog-empty {
			min-height: 280px;
		}
	}
</style>
