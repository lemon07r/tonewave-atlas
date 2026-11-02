<script lang="ts">
	let {
		messages,
		onundo,
		ondismiss
	}: { messages: string[]; onundo?: (() => void) | undefined; ondismiss: () => void } = $props();
</script>

{#if messages.length}<aside class="migration-note small muted" aria-label="Catalog update">
		<p role="status">{messages.join(' ')}</p>
		<div class="actions">
			{#if onundo}<button type="button" onclick={onundo}>Undo</button>{/if}
			<button type="button" onclick={ondismiss} aria-label="Dismiss catalog update">Dismiss</button>
		</div>
	</aside>{/if}

<style>
	.migration-note {
		margin-block: 16px;
	}
	button {
		min-height: 32px;
		padding: 4px 8px;
		color: var(--accent);
		background: none;
		border: 0;
		text-decoration: underline;
	}
</style>
