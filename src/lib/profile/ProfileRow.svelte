<script lang="ts">
	import Rating from '#lib/components/Rating.svelte';
	import { strength, type WorkspaceItem } from './profile.ts';
	import PreferenceFields from './PreferenceFields.svelte';
	import ReferenceVariant from './ReferenceVariant.svelte';
	import type { CatalogIdentity } from '#lib/catalog/identity.ts';
	let {
		item,
		identity,
		name,
		partition,
		onchange,
		onremove
	}: {
		item: WorkspaceItem;
		identity?: CatalogIdentity | undefined;
		name: string;
		partition: string;
		onchange: (item: WorkspaceItem) => void;
		onremove: () => void;
	} = $props();
	let open = $state(false);
	let picked = $state(false);
</script>

<section class="profile-row" aria-label={name}>
	<div class="compact-row">
		<div class="heading">
			<h3 class="product-name">{name}</h3>
			<button type="button" onclick={onremove} aria-label={`Remove ${name}`}>Remove</button>
		</div>
		<Rating
			compact
			label={`Rating for ${name}`}
			value={item.rating}
			onchange={(rating: WorkspaceItem['rating']) => {
				if (!picked && ['like', 'love', 'dislike'].includes(rating)) {
					open = true;
					picked = true;
				}
				onchange({ ...item, rating, strength: strength(rating) });
			}}
		/>
	</div>
	{#if item.rating === 'unrated' || item.rating === 'neutral' || !item.soundRelated}<p class="inactive">
			{!item.soundRelated
				? 'Recorded, but not used to model sound'
				: item.rating === 'neutral'
					? 'Neutral · not used for sound matching.'
					: 'Not used for matching until you give it a sound-related rating.'}
		</p>{/if}
	<details bind:open>
		<summary>Details<span class="sr-only"> for {name}</span></summary>
		{#if open}<div class="fields">
				<PreferenceFields {item} {name} showRating={false} {onchange} />
				<ReferenceVariant
					{identity}
					productId={item.productId}
					{name}
					{partition}
					measurementId={item.measurementId}
					onchange={(id: string) => {
						const next = { ...item };
						if (id) next.measurementId = id;
						else delete next.measurementId;
						onchange(next);
					}}
				/>
			</div>{/if}
	</details>
</section>

<style>
	.profile-row {
		padding: 12px 0;
		border-top: 1px solid var(--line);
	}
	.compact-row {
		display: grid;
		gap: 8px;
	}
	.heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		flex: 1;
		min-width: min(100%, 180px);
	}
	h3 {
		font-size: 23px;
	}
	button {
		background: none;
		border: 0;
		padding: 4px 0;
		min-height: 32px;
		color: var(--muted);
		text-decoration: underline;
		font-size: var(--text-xs);
	}
	summary {
		min-height: 32px;
		padding: 6px 0;
		font-size: var(--text-xs);
		color: var(--muted);
		cursor: pointer;
	}
	.fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 12px;
		padding: 8px 0;
	}
	.inactive {
		font-size: var(--text-xs);
		color: var(--muted);
		margin-block: 4px;
	}
</style>
