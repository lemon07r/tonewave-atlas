<script lang="ts">
	import type { ProductDetail } from '#core/atlas/types.ts';
	import { detail } from '#lib/discover/display.ts';
	import { rigLabel } from '#lib/rigs.ts';
	let {
		productId,
		name,
		partition,
		measurementId,
		onchange
	}: {
		productId: string;
		name: string;
		partition: string;
		measurementId?: string | undefined;
		onchange: (id: string) => void;
	} = $props();
	let open = $state<boolean>(false);
	let data = $state.raw<ProductDetail>();
	let error = $state('');
	$effect(() => {
		if (!open) return;
		let active = true;
		void detail(productId).then(
			(value) => {
				if (active) data = value;
			},
			() => {
				if (active) error = 'Measurements could not be loaded.';
			}
		);
		return () => {
			active = false;
		};
	});
</script>

<details bind:open>
	<summary>Reference variant{measurementId ? ' · explicit measurement selected' : ''}</summary>
	{#if data}<label class="field-label"
			>Measurement for {name}<select
				value={measurementId ?? ''}
				onchange={(event) => {
					onchange(event.currentTarget.value);
				}}
			>
				<option value="">Default product consensus</option>
				{#each data.measurements.filter((m) => !partition || m.measurement.partition === partition || m.measurement.id === measurementId) as entry (entry.measurement.id)}
					<option value={entry.measurement.id}
						>{entry.source.name} · {entry.measurement.variant.label} · {rigLabel(
							entry.measurement.partition
						)}</option
					>
				{/each}
			</select></label
		>{:else}<p role="status">{error || 'Loading reference measurements…'}</p>{/if}
</details>

<style>
	details {
		font-size: var(--text-xs);
		color: var(--muted);
	}
	summary {
		cursor: pointer;
		padding: 8px 0;
		min-height: 36px;
	}
	select {
		display: block;
		width: 100%;
		margin-top: 8px;
	}
</style>
