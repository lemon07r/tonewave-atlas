<script lang="ts">
	let { rows = 3, label = 'Loading results' }: { rows?: number; label?: string } = $props();
</script>

<div role="status" aria-label={label} class="skeleton">
	<span class="sr-only">{label}</span>{#each Array.from({ length: rows }, (_, i) => i) as i (i)}<div
			class="loading-row"
			aria-hidden="true"
		>
			<span></span><span></span>
		</div>{/each}
</div>

<style>
	.loading-row {
		height: 88px;
		padding: 20px 0;
		border-bottom: var(--hairline) solid var(--line);
		display: grid;
		align-content: center;
		gap: 10px;
	}
	.loading-row span {
		height: 12px;
		background: var(--subtle);
		border-radius: 2px;
		width: 60%;
		animation: breathe 1.6s ease-in-out infinite alternate;
	}
	.loading-row span + span {
		width: 35%;
		height: 8px;
	}
	@keyframes breathe {
		to {
			opacity: 0.45;
		}
	}
</style>
