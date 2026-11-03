<script lang="ts">
	import { datasetUpdate } from '#lib/analysis/errors.svelte.ts';
	import Notice from './Notice.svelte';
	let {
		onreload = () => {
			window.location.reload();
		}
	}: { onreload?: () => void } = $props();
</script>

{#if datasetUpdate.message}<div class="dataset-update" role="status">
		<Notice
			><p>{datasetUpdate.message}</p>
			<button type="button" class="button quiet" onclick={onreload}>Reload</button></Notice
		>
	</div>{/if}

<style>
	.dataset-update {
		max-width: 1440px;
		margin: 20px auto;
		padding-inline: 20px;
	}
	button {
		margin-top: 12px;
	}
</style>
