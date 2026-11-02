<script lang="ts">
	import type { ProductListItem } from '#core/atlas/types.ts';
	import type { WorkspaceItem } from './profile.ts';
	import PreferenceFields from './PreferenceFields.svelte';
	import ReferenceVariant from './ReferenceVariant.svelte';
	let {
		items,
		products,
		partition = '',
		onchange
	}: {
		items: WorkspaceItem[];
		products: ProductListItem[];
		partition?: string;
		onchange: (items: WorkspaceItem[], message: string) => void;
	} = $props();
	function update(next: WorkspaceItem) {
		onchange(
			items.map((item) => (item.productId === next.productId ? next : item)),
			'Rating updated.'
		);
	}
</script>

<div class="profile-rows">
	{#each items as item (item.productId)}
		{@const product = products.find((p) => p.id === item.productId)}
		{@const name = product ? `${product.brand} ${product.model}` : item.productId}
		<section class="profile-row" aria-label={name}>
			<div class="heading">
				<h3 class="product-name">{name}</h3>
				<button
					type="button"
					onclick={() => {
						onchange(
							items.filter((i) => i.productId !== item.productId),
							`${name} removed.`
						);
					}}
					aria-label={`Remove ${name}`}>Remove</button
				>
			</div>
			{#if item.rating === 'unrated'}<p class="inactive">
					Not used for matching until you give it a sound-related rating.
				</p>{/if}
			<PreferenceFields {item} {name} onchange={update} />
			<ReferenceVariant
				productId={item.productId}
				{name}
				{partition}
				measurementId={item.measurementId}
				onchange={(id: string) => {
					const next = { ...item };
					if (id) next.measurementId = id;
					else delete next.measurementId;
					update(next);
				}}
			/>
		</section>
	{/each}
</div>

<style>
	.profile-row {
		padding: 20px 0;
		border-top: 1px solid var(--line);
		display: grid;
		gap: 12px;
	}
	.heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
	}
	h3 {
		font-size: 24px;
	}
	button {
		background: none;
		border: 0;
		padding: 8px 0;
		min-height: 36px;
		color: var(--muted);
		text-decoration: underline;
		font-size: var(--text-xs);
	}
	.inactive {
		font-size: var(--text-xs);
		color: var(--muted);
	}
</style>
