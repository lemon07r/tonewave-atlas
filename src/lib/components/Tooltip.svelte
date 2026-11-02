<script lang="ts">
	import type { Snippet } from 'svelte';
	let { text, label, children }: { text: string; label: string; children: Snippet } = $props();
	const id = $props.id();
	let dismissed = $state(false);
</script>

<span
	class="tooltip-wrap"
	role="presentation"
	onpointerenter={() => (dismissed = false)}
	onpointerleave={() => (dismissed = false)}
>
	<button
		type="button"
		class="tooltip-trigger"
		aria-label={label}
		aria-describedby={dismissed ? undefined : id}
		onfocus={() => (dismissed = false)}
		onkeydown={(event) => {
			if (event.key === 'Escape') dismissed = true;
		}}>{@render children()}</button
	>
	<span {id} role="tooltip" class:hidden={dismissed}>{text}</span>
</span>

<style>
	.tooltip-wrap {
		position: relative;
		display: inline-flex;
	}
	.tooltip-trigger {
		border: 0;
		background: none;
		color: var(--muted);
		min-width: 32px;
		min-height: 32px;
		display: grid;
		place-items: center;
		padding: 4px;
	}
	[role='tooltip'] {
		visibility: hidden;
		position: absolute;
		z-index: var(--z-popup);
		inset: auto 0 calc(100% + 8px) auto;
		width: max-content;
		max-width: min(280px, 75vw);
		padding: 12px 16px;
		color: var(--paper);
		background: var(--ink);
		border-radius: var(--radius);
		font-size: var(--text-xs);
		font-weight: 400;
		text-align: left;
	}
	.tooltip-wrap:hover [role='tooltip']:not(.hidden),
	.tooltip-wrap:focus-within [role='tooltip']:not(.hidden) {
		visibility: visible;
	}
	[role='tooltip'].hidden {
		visibility: hidden;
	}
</style>
