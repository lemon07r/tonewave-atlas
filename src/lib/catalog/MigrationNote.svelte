<script lang="ts">
	import { tick } from 'svelte';
	let {
		messages,
		onundo,
		ondismiss
	}: { messages: string[]; onundo?: (() => void) | undefined; ondismiss: () => void } = $props();
	function act(callback: () => void) {
		const target =
			document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('main');
		callback();
		void tick().then(() => {
			target?.setAttribute('tabindex', '-1');
			target?.focus({ preventScroll: true });
		});
	}
</script>

{#if messages.length}<aside class="migration-note small muted" aria-label="Catalog update">
		<p role="status">{messages.join(' ')}</p>
		<div class="actions">
			{#if onundo}<button
					type="button"
					onclick={() => {
						act(onundo);
					}}>Undo</button
				>{/if}
			<button
				type="button"
				onclick={() => {
					act(ondismiss);
				}}
				aria-label="Dismiss catalog update">Dismiss</button
			>
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
