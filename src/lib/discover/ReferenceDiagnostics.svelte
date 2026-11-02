<script lang="ts">
	import type { AtlasSummary, MeasurementInfo, ProductListItem } from '#core/atlas/types.ts';
	import { analysis } from '#lib/atlas.ts';
	import type { WorkspaceItem } from '#lib/profile/profile.ts';
	import { rigLabel } from '#lib/rigs.ts';
	import { referenceDiagnostic } from './evidence.ts';
	import type { CatalogIdentity } from '#lib/catalog/identity.ts';
	import { canonicalItem } from '#lib/catalog/migrate.ts';
	import { productFor } from '#lib/product/data.ts';
	let {
		items,
		identity,
		products,
		partition,
		sources
	}: {
		items: WorkspaceItem[];
		identity?: CatalogIdentity | undefined;
		products: ProductListItem[];
		partition: string;
		sources: AtlasSummary['sources'];
	} = $props();
	let measurements = $state.raw<MeasurementInfo[]>([]);
	let loading = $state(true);
	let error = $state('');
	$effect(() => {
		const explicit = items
			.map((item) => (identity ? canonicalItem(item, identity) : item))
			.filter((item) => item.measurementId);
		const abort = new AbortController();
		loading = true;
		void analysis()
			.then((service) =>
				service.measurements(explicit.flatMap((item) => (item.measurementId ? [item.measurementId] : [])))
			)
			.then(
				(rows) => {
					if (!abort.signal.aborted) {
						measurements = rows;
						loading = false;
					}
				},
				() => {
					if (!abort.signal.aborted) {
						error = 'Variant metadata could not be loaded. No measurement has been substituted.';
						loading = false;
					}
				}
			);
		return () => {
			abort.abort();
		};
	});
</script>

{#if loading}<p role="status">Checking reference measurements…</p>{:else}<ul class="diagnostics">
		{#each items.filter((item) => item.soundRelated && ['like', 'love'].includes(item.rating)) as original (original.productId)}
			{@const item = identity ? canonicalItem(original, identity) : original}
			{@const product = productFor(products, item.productId, identity)}
			{@const diagnostic = referenceDiagnostic(item, product, measurements, partition)}
			<li>
				<strong>{product ? `${product.brand} ${product.model}` : 'Unavailable product'}</strong
				>{diagnostic.variant ? ` · selected variant ${diagnostic.variant}` : ' · default measurements'}:
				{#if diagnostic.status === 'unknown-measurement'}the selected measurement is not available for this
					product.
				{:else if diagnostic.status === 'unknown-product'}not in this form-factor catalog.
				{:else}{diagnostic.status === 'missing-rig'
						? `not measured on ${rigLabel(partition, sources)}. `
						: ''}Available on {diagnostic.partitions.map((id) => rigLabel(id, sources)).join(', ') ||
						'no rig with default measurements'}.{/if}
			</li>
		{/each}
	</ul>{/if}
{#if error}<p>{error}</p>{/if}

<style>
	.diagnostics {
		padding-left: 20px;
	}
	li {
		margin-block: 10px;
	}
</style>
