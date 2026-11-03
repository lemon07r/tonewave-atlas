<script lang="ts">
	import type { RankChange } from './rank-changes.ts';
	let { change }: { change?: RankChange | undefined } = $props();
</script>

{#if change === 'new' || (typeof change === 'number' && change !== 0)}<span
		class="rank-change"
		role="img"
		aria-label={change === 'new'
			? 'New match'
			: `Moved ${change > 0 ? 'up' : 'down'} ${Math.abs(change)} places`}
		>{change === 'new' ? 'New' : `${change > 0 ? '↑' : '↓'}${Math.abs(change)}`}</span
	>{/if}

<style>
	.rank-change {
		display: block;
		font-family: 'DM Sans Variable', sans-serif;
		font-size: var(--text-xs);
		line-height: 1.5;
		color: var(--muted);
		white-space: nowrap;
	}
</style>
