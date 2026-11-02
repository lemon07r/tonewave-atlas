<script lang="ts">
	import type { AtlasSummary, MeasurementInfo, ProductListItem, SourceMode } from '#core/atlas/types.ts';
	import { analysis } from '#lib/atlas.ts';
	import type { WorkspaceItem } from '#lib/profile/profile.ts';
	import { rigLabel } from '#lib/rigs.ts';
	import { referenceDiagnostic } from './evidence.ts';
	import type { CatalogIdentity } from '#lib/catalog/identity.ts';
	import { canonicalItem } from '#lib/catalog/migrate.ts';
	import { productFor } from '#lib/product/data.ts';
	import { detail } from './display.ts';
	let {
		items,
		identity,
		products,
		partition,
		sources,
		selected = [],
		mode = 'coverage'
	}: {
		items: WorkspaceItem[];
		identity?: CatalogIdentity | undefined;
		products: ProductListItem[];
		partition: string;
		sources: AtlasSummary['sources'];
		selected?: string[];
		mode?: SourceMode;
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
		error = '';
		measurements = [];
		const defaults =
			mode === 'only' && selected.length
				? items
						.filter(
							(item) =>
								!item.measurementId && item.soundRelated && !['unrated', 'neutral'].includes(item.rating)
						)
						.map((item) => (identity ? canonicalItem(item, identity) : item))
				: [];
		void Promise.all([
			analysis().then((service) =>
				service.measurements(explicit.flatMap((item) => (item.measurementId ? [item.measurementId] : [])))
			),
			Promise.all(
				defaults.map(async (item): Promise<MeasurementInfo[]> => {
					const product = await detail(item.productId);
					return product.measurements.map(({ measurement, source }) => ({
						id: measurement.id,
						productId: measurement.productId,
						brand: product.product.brand,
						model: product.product.model,
						partition: measurement.partition,
						sourceId: source.id,
						sourceName: source.name,
						variantLabel: measurement.variant.label,
						variantKind: measurement.variant.kind
					}));
				})
			)
		])
			.then(([explicitRows, defaults]) => [...explicitRows, ...defaults.flat()])
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
		{#each items.filter((item) => item.soundRelated && !['unrated', 'neutral'].includes(item.rating)) as original (original.productId)}
			{@const item = identity ? canonicalItem(original, identity) : original}
			{@const product = productFor(products, item.productId, identity)}
			{@const diagnostic = referenceDiagnostic(item, product, measurements, partition, { selected, mode })}
			<li>
				<strong>{product ? `${product.brand} ${product.model}` : 'Unavailable product'}</strong
				>{diagnostic.variant ? ` · selected variant ${diagnostic.variant}` : ' · default measurements'}:
				{#if diagnostic.status === 'unknown-measurement'}the selected measurement is not available for this
					product.
				{:else if diagnostic.status === 'unknown-product'}not in this form-factor catalog.
				{:else if diagnostic.status === 'unavailable'}No eligible {item.measurementId
						? 'selected'
						: 'default'} measurements{mode === 'only' ? ' for these reviewers' : ''}.
				{:else}{diagnostic.status === 'missing-rig'
						? `not measured on ${rigLabel(partition, sources)}. `
						: ''}Available on {diagnostic.partitions.map((id) => rigLabel(id, sources)).join(', ')}.{/if}
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
