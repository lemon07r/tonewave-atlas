<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		route,
		referenceName,
		rig,
		likedCount,
		children
	}: {
		route: 'similar' | 'compare' | 'taste';
		referenceName: string;
		rig: string;
		likedCount: number;
		children?: Snippet;
	} = $props();
</script>

<p class="method-sentence">
	{route === 'similar'
		? `Closest measured responses to ${referenceName} on ${rig}`
		: route === 'compare'
			? `Products that balance your ${likedCount} liked references (mean/worst-case) on ${rig}`
			: `Ranked by your taste profile on ${rig}: likes pull, sound-related dislikes push away`}
</p>
<details class="ranking-method">
	<summary>How this ranking works</summary>
	<p>
		{route === 'similar'
			? 'We compare measured response shapes after smoothing and level alignment. A smaller distance means a closer measured shape, not better sound.'
			: route === 'compare'
				? 'Each distance is level-aligned independently to its reference. Sort by the mean distance for overall closeness, or the worst-case distance for a balanced compromise.'
				: 'Liked measurements form one or more taste centres. Sound-related dislikes add measured directional constraints, or near-duplicate avoidance when no usable reason is given.'}
	</p>
	{#if route !== 'taste'}<p class="stability-caveat">
			Rank ranges show what changes when one reviewer is left out, among the returned matches plus up to 10
			more; sides with fewer than 3 reviewers aren't assessed, so a narrow range does not establish stability
			there. This does not assess unit variation or whether a difference is audible.
		</p>{/if}
	{@render children?.()}
</details>

<style>
	.method-sentence {
		font-size: var(--text-sm);
		margin-top: 12px;
	}
	.ranking-method {
		font-size: var(--text-xs);
		color: var(--muted);
	}
	summary {
		min-height: 32px;
		padding-block: 6px;
		cursor: pointer;
	}
	.ranking-method p {
		margin-block: 8px;
	}
</style>
