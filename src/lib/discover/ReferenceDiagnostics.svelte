<script lang="ts">
	import type {
		AtlasSummary,
		MeasurementInfo,
		ProductListItem,
		SourceMode,
		TasteResult
	} from '#core/atlas/types.ts';
	import type { Form } from '#core/dataset/types.ts';
	import { analysis } from '#lib/atlas.ts';
	import type { WorkspaceItem } from '#lib/profile/profile.ts';
	import { rigLabel } from '#lib/rigs.ts';
	import { referenceDiagnostic } from './evidence.ts';
	import type { CatalogIdentity } from '#lib/catalog/identity.ts';
	import { canonicalItem } from '#lib/catalog/migrate.ts';
	import { productFor, productMeasurements } from '#lib/product/data.ts';
	let {
		items,
		form,
		version,
		identity,
		products,
		partition,
		sources,
		selected = [],
		mode = 'coverage',
		explain = false,
		unused = []
	}: {
		items: WorkspaceItem[];
		form: Form;
		version: string;
		identity?: CatalogIdentity | undefined;
		products: ProductListItem[];
		partition: string;
		sources: AtlasSummary['sources'];
		selected?: string[];
		mode?: SourceMode;
		explain?: boolean;
		unused?: TasteResult['unusedItems'];
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
		const selectedForm = form,
			selectedVersion = version;
		void Promise.allSettled([
			analysis().then((service) =>
				service.measurements(explicit.flatMap((item) => (item.measurementId ? [item.measurementId] : [])))
			),
			...defaults.map((item) =>
				productMeasurements(selectedForm, selectedVersion, item.productId, abort.signal)
			)
		]).then((outcomes) => {
			if (abort.signal.aborted) return;
			measurements = outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? outcome.value : []));
			if (outcomes.some((outcome) => outcome.status === 'rejected'))
				error = 'Variant metadata could not be loaded. No measurement has been substituted.';
			loading = false;
		});
		return () => {
			abort.abort();
		};
	});
</script>

{#if loading}<p role="status">Checking reference measurements…</p>{:else}<ul class="diagnostics">
		{#each items.filter((item) => explain || (item.soundRelated && !['unrated', 'neutral'].includes(item.rating))) as original (original.productId)}
			{@const item = identity ? canonicalItem(original, identity) : original}
			{@const product = productFor(products, item.productId, identity)}
			{@const diagnostic = referenceDiagnostic(item, product, measurements, partition, { selected, mode })}
			{@const excluded = unused.find((entry) => entry.productId === item.productId)}
			<li>
				{#if explain}<strong>{product ? `${product.brand} ${product.model}` : 'Unavailable product'}</strong>:
					{#if !item.soundRelated}excluded · comfort-only. Recorded, but not used to model sound.
					{:else if item.rating === 'unrated'}excluded · unrated.
					{:else if item.rating === 'neutral'}excluded · neutral.
					{:else if excluded}excluded · {excluded.reason.replaceAll('-', ' ')}.
					{:else if diagnostic.status === 'missing-rig'}excluded · incompatible rig ({rigLabel(
							partition,
							sources
						)}).
					{:else if diagnostic.status !== 'available'}excluded · {diagnostic.status === 'unknown-product'
							? 'missing product'
							: 'missing measurement'}{mode === 'only' ? ' for selected reviewers' : ''}.
					{:else}participates · {item.rating}{item.rating === 'dislike' ? ' (sound-related)' : ''}.
					{/if}
				{:else}
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
				{/if}
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
