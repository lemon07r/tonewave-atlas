<script lang="ts">
	import type { ProductListItem } from '#core/atlas/types.ts';
	import type { WorkspaceItem } from './profile.ts';
	import ProfileRow from './ProfileRow.svelte';
	import type { CatalogIdentity } from '#lib/catalog/identity.ts';
	import { canonicalItem } from '#lib/catalog/migrate.ts';
	import { productFor } from '#lib/product/data.ts';
	let {
		items,
		products,
		identity,
		partition = '',
		onchange
	}: {
		items: WorkspaceItem[];
		products: ProductListItem[];
		identity?: CatalogIdentity | undefined;
		partition?: string;
		onchange: (items: WorkspaceItem[], message: string) => void;
	} = $props();
</script>

<div class="profile-rows">
	{#each items as item, index (item.productId)}
		{@const current = identity ? canonicalItem(item, identity) : item}
		{@const product = productFor(products, current.productId, identity)}
		<ProfileRow
			{item}
			{identity}
			name={product ? `${product.brand} ${product.model}` : `Unavailable product ${index + 1}`}
			{partition}
			onchange={(next: WorkspaceItem) => {
				onchange(
					items.map((row) => (row.productId === next.productId ? next : row)),
					'Preferences updated.'
				);
			}}
			onremove={() => {
				onchange(
					items.filter((row) => row.productId !== item.productId),
					`${product ? `${product.brand} ${product.model}` : 'Unavailable product'} removed.`
				);
			}}
		/>
	{/each}
</div>
