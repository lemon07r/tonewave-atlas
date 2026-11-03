<script lang="ts">
	import { analysisError } from '#lib/analysis/errors.svelte.ts';
	import type { ProductDetail } from '#core/atlas/types.ts';
	import { SvelteMap } from 'svelte/reactivity';
	import { detail } from '#lib/discover/display.ts';
	import { rigLabel } from '#lib/rigs.ts';
	import type { CatalogIdentity } from '#lib/catalog/identity.ts';
	let {
		productId,
		identity,
		name,
		partition,
		measurementId,
		onchange
	}: {
		productId: string;
		identity?: CatalogIdentity | undefined;
		name: string;
		partition: string;
		measurementId?: string | undefined;
		onchange: (id: string) => void;
	} = $props();
	let data = $state.raw<ProductDetail>();
	let error = $state('');
	let currentMeasurement = $derived(
		measurementId ? (identity?.measurementId(measurementId) ?? measurementId) : ''
	);
	let eligible = $derived(
		data?.measurements.filter(
			(m) => !partition || m.measurement.partition === partition || m.measurement.id === currentMeasurement
		) ?? []
	);
	let reviewers = $derived.by(() => {
		const grouped = new SvelteMap<string, { id: string; name: string; count: number; rigs: Set<string> }>();
		for (const entry of eligible) {
			const group = grouped.get(entry.source.id) ?? {
				id: entry.source.id,
				name: entry.source.name,
				count: 0,
				rigs: new Set<string>()
			};
			group.count++;
			group.rigs.add(rigLabel(entry.measurement.partition, [entry.source]));
			grouped.set(group.id, group);
		}
		return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
	});
	// A local reviewer choice does not change sound evidence until a measurement is chosen.
	let selectedSource = $derived(
		data?.measurements.find((entry) => entry.measurement.id === currentMeasurement)?.source.id ??
			(currentMeasurement ? 'unavailable' : '')
	);
	let reviewer = $derived(selectedSource);
	let reviewerMeasurements = $derived(eligible.filter((entry) => entry.source.id === reviewer));
	$effect(() => {
		let active = true;
		error = '';
		// Match canonicalItem: only a redirected measurement overrides a surviving product.
		const movedOwner =
			currentMeasurement && currentMeasurement !== measurementId
				? identity?.measurementProduct(currentMeasurement)
				: undefined;
		void detail(
			movedOwner ??
				identity?.productId(productId) ??
				identity?.measurementProduct(currentMeasurement) ??
				productId
		).then(
			(value) => {
				if (active) data = value;
			},
			(cause: unknown) => {
				if (active) error = analysisError(cause, 'Measurements could not be loaded.');
			}
		);
		return () => {
			active = false;
		};
	});
</script>

<div class="variant">
	{#if data}<label class="field-label"
			>Reviewer for {name}<select
				value={reviewer}
				onchange={(event) => {
					reviewer = event.currentTarget.value;
					if (!reviewer) onchange('');
				}}
			>
				<option value="">Consensus of all reviewers (recommended)</option>
				{#if selectedSource === 'unavailable'}<option value="unavailable"
						>Selected measurement unavailable</option
					>{/if}
				{#each reviewers as source (source.id)}
					<option value={source.id}
						>{source.name} · {source.count}
						{source.count === 1 ? 'measurement' : 'measurements'} · {[...source.rigs].join(', ')}</option
					>
				{/each}
			</select></label
		>
		{#if reviewer}<label class="field-label"
				>Measurement for {name}<select
					value={reviewer === selectedSource ? currentMeasurement : ''}
					onchange={(event) => {
						onchange(event.currentTarget.value);
					}}
				>
					<option value="" disabled>Choose this reviewer’s measurement</option>
					{#if reviewer === 'unavailable'}<option value={currentMeasurement}
							>Selected measurement unavailable · {currentMeasurement}</option
						>{/if}
					{#each reviewerMeasurements as entry (entry.measurement.id)}
						<option value={entry.measurement.id}
							>{entry.measurement.variant.label} · {rigLabel(entry.measurement.partition, [entry.source])} · {entry
								.measurement.id}</option
						>
					{/each}
				</select></label
			>{/if}
	{:else}<p role="status">{error || 'Loading reference measurements…'}</p>{/if}
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
