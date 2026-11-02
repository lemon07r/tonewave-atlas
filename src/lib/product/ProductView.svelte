<script lang="ts">
	import { resolve } from '$app/paths';
	import FrChart from '#lib/components/FrChart.svelte';
	import Notice from '#lib/components/Notice.svelte';
	import SegmentedControl from '#lib/components/SegmentedControl.svelte';
	import Equalizer from './Equalizer.svelte';
	import { analysis } from '#lib/atlas.ts';
	import { channelSpread, dateLabel, mainPartition, priceListings, rigLabel } from './data.ts';
	import type { ProductDetail, ProductListItem } from '#core/atlas/types.ts';
	import type { FrSeries } from '#lib/chart.ts';
	import type { Channel } from '#lib/compare/url.ts';
	import { chartLegendNames } from '#lib/compare/chart-legend.ts';
	let {
		detail,
		products,
		headphones
	}: { detail: ProductDetail; products: ProductListItem[]; headphones: boolean } = $props();
	let partition = $state('');
	let channel = $state<Channel>('avg');
	let selected = $state<string[]>([]);
	let series = $state.raw<FrSeries[]>([]);
	let error = $state('');
	let busy = $state(false);
	let partitions = $derived([...new Set(detail.measurements.map((r) => r.measurement.partition))]);
	let formQuery = $derived(headphones ? '&form=headphones' : '');
	let listings = $derived(
		priceListings(
			detail.measurements.map((r) => r.measurement),
			detail.measurements.map((r) => r.source)
		)
	);
	$effect(() => {
		partition = mainPartition(detail);
		selected = [];
		channel = 'avg';
	});
	$effect(() => {
		const product = detail,
			rig = partition,
			ch = channel,
			ids = selected;
		const abort = new AbortController();
		if (!rig) return;
		busy = true;
		error = '';
		series = [];
		void (async () => {
			const spread = await channelSpread(product, rig, ch);
			const curves = await (await analysis()).curves(ids, { channel: ch });
			const output: FrSeries[] = [];
			if (spread)
				output.push({
					id: product.product.id,
					label: `Default consensus · ${rigLabel(rig)} · ${ch}`,
					values: spread.centre,
					...(spread.sourceCount >= 2 ? { lo: spread.min, hi: spread.max } : {}),
					attribution: product.measurements
						.filter((r) => spread.measurementIds.includes(r.measurement.id))
						.map((r) => `${r.source.name} ${r.measurement.provenance.databaseUrl}`)
						.join('; ')
				});
			for (const curve of curves) {
				const row = product.measurements.find((r) => r.measurement.id === curve.measurementId);
				if (!curve.values)
					throw new Error(`${row?.source.name ?? curve.measurementId}: ${ch} channel unavailable.`);
				if (row)
					output.push({
						id: curve.measurementId,
						label: `${row.source.name} · ${row.measurement.variant.label || 'default'} · ${ch}`,
						values: curve.values,
						attribution: row.measurement.provenance.databaseUrl
					});
			}
			if (!abort.signal.aborted) series = output;
		})()
			.catch((e: unknown) => {
				if (!abort.signal.aborted) error = String(e);
			})
			.finally(() => {
				if (!abort.signal.aborted) busy = false;
			});
		return () => {
			abort.abort();
		};
	});
	function toggle(id: string, checked: boolean) {
		selected = checked ? [...selected, id] : selected.filter((item) => item !== id);
	}
</script>

<div class="product-heading">
	<a href={resolve(`/explore${headphones ? '?form=headphones' : ''}`)}
		>← All {headphones ? 'headphones' : 'IEMs'}</a
	>
	<p class="eyebrow">{detail.product.brand}</p>
	<h1>{detail.product.model}</h1>
	<div class="row actions">
		<a class="button primary" href={resolve(`/?ref=${detail.product.id}${formQuery}`)}>Find similar</a><a
			class="button quiet"
			href={resolve(`/compare?p=${detail.product.id}${formQuery}`)}>Compare</a
		>
	</div>
	{#each listings as listing (listing)}<p class="small muted">{listing}</p>{/each}
</div>
<div class="product-grid">
	<div class="measurements">
		<h2>Measurements & provenance</h2>
		<p class="small muted intro">
			All available variants, grouped by rig and source. Select individual curves for the active rig; the
			default consensus stays visible.
		</p>
		{#each partitions as rig (rig)}
			<section class="rig-group" aria-label={`${rigLabel(rig)} measurements`}>
				<h3>{rigLabel(rig)}</h3>
				{#each [...new Map(detail.measurements
							.filter((r) => r.measurement.partition === rig)
							.map((r) => [r.source.id, r.source])).values()] as source (source.id)}
					<div class="source-group">
						<h4><a href={source.url} rel="external">{source.name}</a></h4>
						<p class="small muted">
							{source.rig || rigLabel(rig)}{source.rigInferred ? ' · rig inferred, not verified' : ''} · crawled
							{dateLabel(source.crawledAt)}
						</p>
						{#each detail.measurements.filter((r) => r.measurement.partition === rig && r.source.id === source.id) as row (row.measurement.id)}
							{@const m = row.measurement}
							<div class="measurement">
								<label class="curve-toggle"
									><input
										type="checkbox"
										checked={selected.includes(m.id)}
										onchange={(e) => {
											if (partition !== rig) {
												partition = rig;
												selected = [];
											}
											toggle(m.id, e.currentTarget.checked);
										}}
									/><span
										>{m.variant.label || 'Default variant'}
										<span class="muted small">· {m.variant.kind}</span></span
									></label
								>
								<p class="small muted">
									Channels: {m.channels.join(', ')}{#if m.imbalanceDb !== null}
										· L/R imbalance: {m.imbalanceDb.toFixed(1)} dB RMS (100 Hz–10 kHz){/if}
								</p>
								<p class="small muted">
									Measured: {[...new Set(Object.values(m.dated).filter(Boolean))].join('; ') ||
										'date not provided'}
								</p>
								<div class="row small">
									<a href={m.provenance.databaseUrl} rel="external">Source database</a
									>{#each m.provenance.originalUrls as url, i (url)}<a href={url} rel="external"
											>Original file {i + 1}</a
										>{/each}{#if m.reviewUrl}<a href={m.reviewUrl} rel="external">Review</a
										>{/if}{#if m.provenance.calibrationUrl}<a
											href={m.provenance.calibrationUrl}
											rel="external">Calibration file</a
										>{/if}
								</div>
								{#each m.warnings as warning, i (`${i}-${warning}`)}<p class="small warning">
										{warning}
									</p>{/each}
								<details>
									<summary>Processing & provenance</summary>
									<ul class="small muted">
										{#each m.provenance.processing as step (step)}<li>{step}</li>{/each}
									</ul>
								</details>
							</div>
						{/each}
					</div>
				{/each}
			</section>
		{/each}
	</div>
	<div class="product-chart stack" {@attach chartLegendNames}>
		<div class="row">
			<div>
				<label class="field-label" for="product-rig">Chart & EQ rig</label><select
					id="product-rig"
					bind:value={partition}
					onchange={() => (selected = [])}
					>{#each partitions as rig (rig)}<option value={rig}>{rigLabel(rig)}</option>{/each}</select
				>
			</div>
			<SegmentedControl
				label="Measurement channel"
				bind:value={channel}
				options={[
					{ value: 'avg', label: 'Average' },
					{ value: 'L', label: 'Left' },
					{ value: 'R', label: 'Right' }
				]}
			/>
		</div>
		{#if error}<Notice kind="caution">{error}</Notice>{/if}{#if busy}<p role="status">Loading curves…</p>{/if}
		<FrChart
			{series}
			title={`${detail.product.brand} ${detail.product.model}`}
			emptyText="No default consensus on this rig/channel. Select an individual measurement or a different channel."
		/>
		<p class="small muted">
			Shading shows observed default-measurement min/max only when at least two sources contribute. This is
			not a confidence interval. Individual curves retain their measured level; use Compare for level
			alignment.
		</p>
		<Notice kind="caution"
			>Rigs are kept separate. Fit and insertion depth change measurements, particularly above 8 kHz. A
			single-source curve is not evidence of certainty.</Notice
		>
	</div>
</div>
<Equalizer {detail} {products} {partition} />

<style>
	.product-heading {
		margin-bottom: 40px;
	}
	.product-heading .eyebrow {
		margin-top: 32px;
		margin-bottom: 12px;
	}
	.actions {
		margin: 24px 0;
	}
	.product-grid {
		display: grid;
		grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.2fr);
		gap: 48px;
		align-items: start;
	}
	.intro {
		margin-top: 16px;
	}
	.rig-group {
		border-top: 1px solid var(--line);
		padding-top: 24px;
		margin-top: 24px;
	}
	.source-group h4 {
		margin-bottom: 8px;
	}
	.measurement {
		border-top: 1px solid var(--line);
		padding: 16px 0;
		margin-top: 16px;
	}
	.measurement p {
		margin: 8px 0;
	}
	.curve-toggle {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
	}
	.curve-toggle input {
		width: 20px;
		height: 20px;
		accent-color: var(--accent);
		flex-shrink: 0;
	}
	.product-chart {
		position: sticky;
		top: 24px;
		min-width: 0;
	}
	details {
		margin-top: 12px;
	}
	.warning {
		color: var(--caution);
	}
	@media (max-width: 900px) {
		.product-grid {
			display: flex;
			flex-direction: column-reverse;
			gap: 32px;
		}
		.product-grid > * {
			width: 100%;
		}
		.product-chart {
			position: static;
		}
	}
</style>
