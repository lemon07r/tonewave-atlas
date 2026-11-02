<script lang="ts">
	import Rating from '#lib/components/Rating.svelte';
	import TagPicker from '#lib/components/TagPicker.svelte';
	import { reasonLabels, aspectLabels, strength, type WorkspaceItem } from './profile.ts';
	let {
		item,
		name,
		onchange
	}: { item: WorkspaceItem; name: string; onchange: (item: WorkspaceItem) => void } = $props();
</script>

<Rating
	label={`Rating for ${name}`}
	value={item.rating}
	onchange={(rating: WorkspaceItem['rating']) => {
		onchange({ ...item, rating, strength: strength(rating) });
	}}
/>
{#if item.rating === 'dislike'}
	<TagPicker
		label="Sound reasons (optional)"
		options={Object.values(reasonLabels)}
		selected={(item.dislikeReasons ?? []).map((r) => reasonLabels[r])}
		onchange={(labels: string[]) => {
			onchange({
				...item,
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
			onchange({
				...item,
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
			onchange({ ...item, soundRelated: !event.currentTarget.checked });
		}}
	/>Fit or comfort, not sound</label
>

<style>
	.comfort {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--text-xs);
		min-height: 36px;
	}
	input {
		accent-color: var(--accent);
	}
</style>
