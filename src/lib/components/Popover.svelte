<script lang="ts">
	import type { Snippet } from 'svelte';
	let { label, trigger, children }: { label: string; trigger?: Snippet; children: Snippet } = $props();
	const id = $props.id();
</script>

<span class="popover-wrap"
	><button type="button" class="button quiet" popovertarget={id}
		>{#if trigger}{@render trigger()}{:else}{label}{/if}</button
	>
	<div {id} popover="auto" aria-label={label}><div class="popover-body">{@render children()}</div></div></span
>

<style>
	[popover] {
		inset: auto;
		position: fixed;
		margin: 8px 20px;
		padding: 0;
		background: var(--surface);
		color: var(--ink);
		border: var(--hairline) solid var(--strong-line);
		border-radius: var(--radius);
		max-width: min(360px, calc(100vw - 40px));
	}
	.popover-body {
		padding: 20px;
	}
</style>
