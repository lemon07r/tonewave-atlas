<script lang="ts">
	import type { ProductListItem } from '#core/atlas/types.ts';
	import type { WorkspaceItem } from './profile.ts';
	import ProfileRow from './ProfileRow.svelte';
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
</script>

<div class="profile-rows">
	{#each items as item (item.productId)}
		{@const product = products.find((p) => p.id === item.productId)}
		<ProfileRow
			{item}
			name={product ? `${product.brand} ${product.model}` : 'Unavailable product'}
			{partition}
			onchange={(next: WorkspaceItem) => {
				onchange(
					items.map((row) => (row.productId === next.productId ? next : row)),
					'Rating updated.'
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
