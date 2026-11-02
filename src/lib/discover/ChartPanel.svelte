<script lang="ts">
	import { GRID } from '#core/grid.ts';
	import type { FrSeries } from '#lib/chart.ts';
	import FrChart from '#lib/components/FrChart.svelte';
	import Notice from '#lib/components/Notice.svelte';
	import SegmentedControl from '#lib/components/SegmentedControl.svelte';
	import type { DiscoveryResult } from './query.ts';
	import { rankedGroups } from './rank-series.ts';
	import { candidateCurve, displayCurve } from './display.ts';
	import { alignDisplaySeries } from './align-display.ts';
	let {
		result,
		overlays,
		nameFor
	}: { result: DiscoveryResult; overlays: string[]; nameFor: (id: string) => string } = $props();
	let view = $state<'rank' | 'detail'>('rank');
	let detailSeries = $state.raw<FrSeries[]>([]);
	let error = $state('');
	let loading = $state(false);
	let groups = $derived(rankedGroups(result, overlays, nameFor));
	let unaligned = $derived(
		result.kind === 'compare'
			? result.data.results.filter((row) => overlays.includes(row.candidate.id) && row.alignedTo === null)
			: []
	);
	$effect(() => {
		if (view !== 'detail') return;
		const current = result;
		const selected = overlays;
		const abort = new AbortController();
		loading = true;
		error = '';
		detailSeries = [];
		void (async () => {
			try {
				const curves: FrSeries[] = [];
				const refs =
					current.kind === 'similar'
						? [current.data.reference]
						: current.kind === 'compare'
							? current.data.references
							: [];
				for (const [i, ref] of refs.entries())
					if (ref.productId)
						curves.push(
							(
								await displayCurve(ref.productId, current.data.partition, {
									id: `detail-reference-${i}`,
									reference: true,
									measurementIds: ref.measurementIds
								})
							).series
						);
				for (const row of current.data.results.filter((row) => selected.includes(row.candidate.id)))
					curves.push((await candidateCurve(row.candidate, current.data.partition)).series);
				if (!abort.signal.aborted) detailSeries = alignDisplaySeries(curves, 'balanced');
			} catch (cause) {
				if (!abort.signal.aborted)
					error = cause instanceof Error ? cause.message : 'Detail measurements could not be loaded.';
			} finally {
				if (!abort.signal.aborted) loading = false;
			}
		})();
		return () => {
			abort.abort();
		};
	});
</script>

<section class="chart-panel" aria-label="Ranked response chart">
	<SegmentedControl
		label="Curve processing"
		options={[
			{ value: 'rank', label: 'As ranked' },
			{ value: 'detail', label: 'Detail measurements' }
		]}
		value={view}
		onchange={(value: 'rank' | 'detail') => {
			view = value;
		}}
	/>
	<p class="chart-note">
		{view === 'rank'
			? `As ranked: smoothed, level-aligned${result.data.harmonised ? ' · reviewer offsets corrected' : ''}.`
			: 'Uncorrected higher-resolution measurements · display-only balanced level alignment; not the scored values.'}
	</p>
	{#if view === 'rank' && unaligned.length}<p class="chart-note">
			Not shown as ranked: {unaligned
				.map((row) => `${row.candidate.product.brand} ${row.candidate.product.model}`)
				.join(', ')}. No reference has enough shared coverage for level alignment. Use Detail measurements to
			inspect these curves.
		</p>{/if}
	{#if view === 'detail' && result.kind === 'taste'}<p class="chart-note">
			Taste centres are derived rank curves, not detail measurements. Switch to “As ranked” to compare each
			match with its scored taste centre.
		</p>{/if}
	{#if view === 'rank'}
		{#each groups as group (group.id)}
			<FrChart
				title={group.label}
				series={group.series}
				frequencies={result.data.rankFrequencies}
				baselineId={group.baselineId}
			/>
		{/each}
	{:else}<FrChart series={detailSeries} frequencies={GRID} baselineId={detailSeries[0]?.id ?? ''} />{/if}
	{#if loading}<p role="status" class="chart-note">Loading detail measurements…</p>{/if}
	{#if error}<Notice kind="caution">{error}</Notice>{/if}
</section>

<style>
	.chart-note {
		color: var(--muted);
		font-size: var(--text-xs);
		margin: 12px 0;
	}
</style>
