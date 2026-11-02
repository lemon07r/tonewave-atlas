<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/env';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import type { PathnameWithSearchOrHash } from '$app/types';
	import { analysis, formFromUrl, productList } from '#lib/atlas.ts';
	import { catalogIdentity, productFor, priceListings } from '#lib/product/data.ts';
	import { migrateUrl } from '#lib/catalog/migrate.ts';
	import { migrationMessages } from '#lib/catalog/notice.ts';
	import MigrationNote from '#lib/catalog/MigrationNote.svelte';
	import { rigLabel } from '#lib/rigs.ts';
	import { productSearch } from '#lib/product-search.ts';
	import ProductView from '#lib/product/ProductView.svelte';
	import Notice from '#lib/components/Notice.svelte';
	import Skeleton from '#lib/components/Skeleton.svelte';
	import Button from '#lib/components/Button.svelte';
	import type { AtlasSummary, ProductDetail, ProductListItem } from '#core/atlas/types.ts';
	let form = $derived(browser ? formFromUrl(new URL(page.url.href)) : 'iem');
	let headphones = $derived(form === 'headphone');
	let productId = $derived(browser ? (page.url.searchParams.get('product') ?? '') : '');
	let products = $state.raw<ProductListItem[]>([]);
	let summary = $state.raw<AtlasSummary | null>(null);
	let detail = $state.raw<ProductDetail | null>(null);
	let loading = $state(true);
	let error = $state('');
	let migrationNote = $state<string[]>([]);
	let query = $state('');
	let brand = $state('');
	let sort = $state('name');
	let currentPage = $state(0);
	const pageSize = 40;
	let brands = $derived([...new Set(products.map((p) => p.brand))].sort((a, b) => a.localeCompare(b)));
	let search = $derived(productSearch(products));
	let filtered = $derived(
		search(query, products.length)
			.filter((p) => !brand || p.brand === brand)
			.sort((a, b) =>
				sort === 'reviewers'
					? b.sourceCount - a.sourceCount || a.model.localeCompare(b.model)
					: sort === 'price'
						? (a.priceUsd?.[0] ?? Infinity) - (b.priceUsd?.[0] ?? Infinity) || a.model.localeCompare(b.model)
						: `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`)
			)
	);
	let visible = $derived(filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize));
	let searchForm = '';
	$effect(() => {
		if (searchForm !== form) {
			searchForm = form;
			query = '';
		}
	});
	$effect(() => {
		const selectedForm = form,
			id = productId,
			href = page.url.href;
		const abort = new AbortController();
		loading = true;
		error = '';
		detail = null;
		summary = null;
		currentPage = 0;
		brand = '';
		void (async () => {
			const service = await analysis();
			const [list, data] = await Promise.all([productList(selectedForm), service.summary()]);
			const identity = await catalogIdentity(selectedForm, data.version);
			abort.signal.throwIfAborted();
			const migrated = migrateUrl(new URL(href), identity);
			const fresh = migrationMessages(migrated.messages);
			if (fresh.length) migrationNote = [...migrationNote, ...fresh];
			if (migrated.changed)
				await goto(
					resolve(
						`${migrated.url.pathname}${migrated.url.search}${migrated.url.hash}` as PathnameWithSearchOrHash
					),
					{ state: page.state, shallow: true, replace: true, reset: false }
				);
			products = list;
			summary = data;
			if (id) {
				const canonical = migrated.url.searchParams.get('product') ?? id;
				if (!productFor(list, canonical, identity))
					throw new Error(
						'This product is not in the selected form-factor catalog. Switch modes or return to the catalog.'
					);
				const result = await service.productDetail(canonical);
				if (!result.ok) throw new Error(result.message);
				if (!abort.signal.aborted) detail = result;
			}
		})()
			.catch((e: unknown) => {
				if (!abort.signal.aborted) error = String(e);
			})
			.finally(() => {
				if (!abort.signal.aborted) loading = false;
			});
		return () => {
			abort.abort();
		};
	});
</script>

<svelte:head
	><title>{detail ? `${detail.product.brand} ${detail.product.model}` : 'Explore'} — Tonewave Atlas</title
	><meta
		name="description"
		content="Browse real measurements, source provenance, rig-aware consensus curves and product-to-product EQ."
	/></svelte:head
>
<div class="page">
	<MigrationNote
		messages={migrationNote}
		ondismiss={() => {
			migrationNote = [];
		}}
	/>
	{#if error}<Notice kind="caution" title="Catalog unavailable"
			>{error}
			<a href={resolve(`/explore${headphones ? '?form=headphones' : ''}`)}>Back to catalog</a></Notice
		>{/if}
	{#if loading}<Skeleton rows={4} label={productId ? 'Loading product measurements' : 'Loading catalog'} />
	{:else if detail}<ProductView {detail} {products} {headphones} sources={summary?.sources ?? []} />
	{:else if !error}
		<div class="page-heading">
			<h1>Explore the measurements.</h1>
			<p>
				Find a product. See every available measurement, variant and source — including where they disagree.
			</p>
		</div>
		{#if headphones}<Notice title="A small headphone dataset"
				>Coverage is currently limited. Rig-specific and single-source measurements are retained without
				pretending they establish broad agreement.</Notice
			>{/if}
		<div class="explore-grid">
			<aside aria-label="Catalog filters" class="stack">
				<div>
					<label class="field-label" for="brand">Brand</label><select
						id="brand"
						bind:value={brand}
						onchange={() => (currentPage = 0)}
						><option value="">All brands</option>{#each brands as name (name)}<option value={name}
								>{name}</option
							>{/each}</select
					>
				</div>
				<div>
					<label class="field-label" for="sort">Sort by</label><select
						id="sort"
						bind:value={sort}
						onchange={() => (currentPage = 0)}
						><option value="name">Name</option><option value="reviewers">Number of reviewers</option><option
							value="price">Listed price (USD)</option
						></select
					>
				</div>
				<p class="small muted">
					Reviewer counts describe available sources, not popularity or quality. Unknown prices sort last.
				</p>
			</aside>
			<section aria-label="Product catalog">
				<label class="field-label" for="catalog-search">Filter {headphones ? 'headphones' : 'IEMs'}</label
				><input
					id="catalog-search"
					class="text-input"
					type="search"
					bind:value={query}
					oninput={() => (currentPage = 0)}
					placeholder="Brand or model"
				/>
				<div class="catalog-heading row spread">
					<h2>{headphones ? 'Headphones' : 'In-ear monitors'}</h2>
					<span class="small muted" role="status"
						>{filtered.length.toLocaleString()} {filtered.length === 1 ? 'product' : 'products'}</span
					>
				</div>
				{#each visible as product (product.id)}<div class="catalog-row">
						<div>
							<p class="eyebrow">{product.brand}</p>
							<h3>
								<a href={resolve(`/explore?product=${product.id}${headphones ? '&form=headphones' : ''}`)}
									>{product.model}</a
								>
							</h3>
							<p class="small muted">
								{product.sourceCount}
								{product.sourceCount === 1 ? 'reviewer' : 'reviewers'} · {product.partitions
									.map((rig) => rigLabel(rig, summary?.sources))
									.join(' / ')}
							</p>
						</div>
						<div class="prices small muted">
							{#each priceListings(product.prices, summary?.sources ?? []) as listing (listing)}<p>
									{listing}
								</p>{/each}
						</div>
					</div>{/each}
				{#if !filtered.length}<p class="empty-state">
						No products match these filters. Try another brand or model.
					</p>{/if}
				<nav class="pagination row spread" aria-label="Catalog pages">
					<Button variant="quiet" disabled={currentPage === 0} onclick={() => currentPage--}>Previous</Button
					><span class="small mono"
						>Page {currentPage + 1} / {Math.max(1, Math.ceil(filtered.length / pageSize))}</span
					><Button
						variant="quiet"
						disabled={(currentPage + 1) * pageSize >= filtered.length}
						onclick={() => currentPage++}>Next</Button
					>
				</nav>
			</section>
		</div>
	{/if}
</div>

<style>
	.explore-grid {
		display: grid;
		grid-template-columns: 228px minmax(0, 1fr);
		gap: 64px;
		margin-top: 32px;
		align-items: start;
	}
	select,
	input {
		width: 100%;
	}
	.catalog-heading {
		padding: 28px 0 16px;
		border-bottom: 1px solid var(--line);
	}
	.catalog-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 24px;
		padding: 20px 0;
		border-bottom: 1px solid var(--line);
	}
	.catalog-row h3 {
		margin: 6px 0;
	}
	.prices {
		align-self: center;
		text-align: right;
	}
	.prices p + p {
		margin-top: 4px;
	}
	.pagination {
		margin-top: 24px;
	}
	@media (max-width: 1050px) {
		.explore-grid {
			grid-template-columns: 200px minmax(0, 1fr);
			gap: 32px;
		}
	}
	@media (max-width: 700px) {
		.explore-grid {
			display: flex;
			flex-direction: column;
			gap: 32px;
		}
		.explore-grid > * {
			width: 100%;
		}
		.catalog-row {
			grid-template-columns: 1fr;
			gap: 8px;
		}
		.prices {
			text-align: left;
		}
	}
</style>
