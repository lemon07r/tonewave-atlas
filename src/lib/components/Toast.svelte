<script lang="ts">
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	let { message, onundo, ondismiss }: { message: string; onundo?: () => void; ondismiss: () => void } =
		$props();
</script>

<p role="status" class="sr-only">{message}</p>
{#if message}<div class="toast">
		<p aria-hidden="true">{message}</p>
		{#if onundo}<Button variant="quiet" onclick={onundo}>Undo</Button>{/if}<Button
			variant="icon"
			aria-label="Dismiss notification"
			onclick={ondismiss}><Icon name="close" size={16} /></Button
		>
	</div>{/if}

<style>
	.toast {
		position: fixed;
		z-index: var(--z-toast);
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 16px;
		width: max-content;
		max-width: calc(100vw - 32px);
		padding: 8px 8px 8px 20px;
		background: var(--surface);
		border: var(--hairline) solid var(--strong-line);
		border-radius: var(--radius);
		font-size: var(--text-sm);
	}
	.toast p {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.toast :global(button) {
		flex-shrink: 0;
	}
</style>
