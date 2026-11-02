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
	let data = $state.raw<ProductDetail>();
	let error = $state('');
	$effect(() => {
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

<div class="variant">
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
</div>

<style>
	.variant {
		font-size: var(--text-xs);
		color: var(--muted);
	}
	select {
		display: block;
		width: 100%;
		min-width: 0;
		margin-top: 8px;
	}
</style>
