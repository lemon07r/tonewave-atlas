<script lang="ts">
	import type { ProductListItem, TasteItem } from '#core/atlas/types.ts';
	import Rating from '#lib/components/Rating.svelte';
	import TagPicker from '#lib/components/TagPicker.svelte';
	import { reasonLabels, aspectLabels, strength } from './profile.ts';
	let {
		items,
		products,
		onchange
	}: { items: TasteItem[]; products: ProductListItem[]; onchange: (items: TasteItem[]) => void } = $props();
	function update(id: string, changes: Partial<TasteItem>) {
		onchange(items.map((item) => (item.productId === id ? { ...item, ...changes } : item)));
	}
</script>

<div class="profile-rows">
	{#each items as item (item.productId)}
		{@const product = products.find((p) => p.id === item.productId)}
		<section class="profile-row" aria-label={product ? `${product.brand} ${product.model}` : item.productId}>
			<div class="heading">
				<h3>{product ? `${product.brand} ${product.model}` : item.productId}</h3>
				<button
					type="button"
					onclick={() => {
						onchange(items.filter((i) => i.productId !== item.productId));
					}}
					aria-label={`Remove ${product ? `${product.brand} ${product.model}` : item.productId}`}
					>Remove</button
				>
			</div>
			<Rating
				label={`Rating for ${product ? `${product.brand} ${product.model}` : item.productId}`}
				value={item.rating}
				onchange={(rating: TasteItem['rating']) => {
					update(item.productId, { rating, strength: strength(rating) });
				}}
			/>
			{#if item.rating === 'dislike'}
				<TagPicker
					options={Object.values(reasonLabels)}
					selected={(item.dislikeReasons ?? []).map((r) => reasonLabels[r])}
					onchange={(labels: string[]) => {
						update(item.productId, {
							dislikeReasons: (Object.keys(reasonLabels) as (keyof typeof reasonLabels)[]).filter((key) =>
								labels.includes(reasonLabels[key])
							)
						});
					}}
				/>
			{:else if item.rating === 'love' || item.rating === 'like'}
				<TagPicker
					label="Liked aspects (optional)"
					options={Object.values(aspectLabels)}
					selected={(item.likedAspects ?? []).map((a) => aspectLabels[a])}
					onchange={(labels: string[]) => {
						update(item.productId, {
							likedAspects: (Object.keys(aspectLabels) as (keyof typeof aspectLabels)[]).filter((key) =>
								labels.includes(aspectLabels[key])
							)
						});
					}}
				/>
			{/if}
			<label class="comfort"
				><input
					type="checkbox"
					checked={!item.soundRelated}
					onchange={(event) => {
						update(item.productId, { soundRelated: !event.currentTarget.checked });
					}}
				/> Fit or comfort, not sound</label
			>
		</section>
	{/each}
</div>

<style>
	.profile-row {
		padding: 20px 0;
		border-top: var(--hairline) solid var(--line);
		display: grid;
		gap: 16px;
	}
	.heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
	}
	h3 {
		font-size: var(--text-base);
	}
	button {
		background: none;
		border: 0;
		padding: 8px 0;
		color: var(--muted);
		text-decoration: underline;
		cursor: pointer;
		font-size: var(--text-xs);
	}
	.comfort {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--text-sm);
		min-height: 36px;
	}
	input {
		accent-color: var(--accent);
	}
</style>
