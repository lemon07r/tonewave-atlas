<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	let {
		kind = 'info',
		title,
		children
	}: { kind?: 'info' | 'caution'; title?: string; children: Snippet } = $props();
</script>

<div class={['notice', kind]}>
	<Icon name={kind === 'caution' ? 'warning' : 'info'} size={18} />
	<div>
		{#if title}<strong>{title}</strong>{/if}
		<div>{@render children()}</div>
	</div>
</div>

<style>
	.notice {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 16px;
		border-left: 2px solid var(--accent);
		background: var(--accent-soft);
		font-size: var(--text-sm);
	}
	.notice :global(svg) {
		color: var(--accent);
		margin-top: 2px;
	}
	strong {
		display: block;
		font-weight: 600;
		margin-bottom: 4px;
	}
	.caution {
		background: var(--caution-soft);
		border-color: var(--caution);
	}
	.caution :global(svg) {
		color: var(--caution);
	}
</style>
