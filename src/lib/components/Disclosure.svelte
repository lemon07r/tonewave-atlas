<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	let {
		label = 'Advanced',
		open = $bindable(false),
		children
	}: { label?: string; open?: boolean; children: Snippet } = $props();
</script>

<details bind:open>
	<summary><Icon name="chevron" size={16} />{label}</summary>
	<div class="contents">{@render children()}</div>
</details>

<style>
	details {
		border-top: var(--hairline) solid var(--line);
	}
	summary {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		font-size: var(--text-sm);
		cursor: pointer;
		list-style: none;
		font-weight: 550;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary :global(svg) {
		transition: transform var(--motion);
	}
	details[open] summary :global(svg) {
		transform: rotate(180deg);
	}
	.contents {
		padding: 8px 0 24px;
	}
</style>
