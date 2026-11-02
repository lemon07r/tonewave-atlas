<script lang="ts">
	import SearchCombobox from '#lib/components/SearchCombobox.svelte';
	import Slider from '#lib/components/Slider.svelte';
	import Notice from '#lib/components/Notice.svelte';
	import FrChart from '#lib/components/FrChart.svelte';
	import Button from '#lib/components/Button.svelte';
	import type { SearchItem } from '#lib/search.ts';
	import { chartLegendNames } from '#lib/compare/chart-legend.ts';
	import { analysis } from '#lib/atlas.ts';
	import type { PeqResponse, ProductDetail, ProductListItem } from '#core/atlas/types.ts';
	import type { FrSeries } from '#lib/chart.ts';
	import { GRID } from '#core/grid.ts';
	import { responseDistance } from '#core/analysis/distance.ts';
	let {
		detail,
		products,
		partition
	}: { detail: ProductDetail; products: ProductListItem[]; partition: string } = $props();
	let query = $state('');
	let targetId = $state('');
	let maxFilters = $state(5);
	let busy = $state(false);
	let error = $state('');
	let result = $state.raw<PeqResponse | null>(null);
	let series = $state.raw<FrSeries[]>([]);
	let before = $state<number | null>(null);
	let request = {};
	let items = $derived(
		products
			.filter(
				(p) =>
					p.id !== detail.product.id &&
					p.partitions.includes(partition) &&
					`${p.brand} ${p.model}`.toLowerCase().includes(query.toLowerCase())
			)
			.slice(0, 35)
			.map((p) => ({ id: p.id, label: `${p.brand} ${p.model}`, sources: p.sourceCount }))
	);
	$effect(() => {
		request = { productId: detail.product.id, partition };
		result = null;
		series = [];
		targetId = '';
		query = '';
		error = '';
		busy = false;
	});
	async function fit(id = targetId, filters = maxFilters) {
		if (!id) return;
		targetId = id;
		const token = {};
		request = token;
		const product = detail,
			rig = partition;
		busy = true;
		error = '';
		result = null;
		try {
			const service = await analysis();
			const [response, target] = await Promise.all([
				service.peq({
					productId: product.product.id,
					partition: rig,
					target: { kind: 'product', productId: id },
					maxFilters: filters
				}),
				service.productDetail(id)
			]);
			if (token !== request) return;
			if (!response.ok) throw new Error(response.message);
			if (!target.ok) throw new Error(target.message);
			const sourceSpread = product.spread.find((s) => s.partition === rig),
				targetSpread = target.spread.find((s) => s.partition === rig);
			if (!sourceSpread || !targetSpread)
				throw new Error('Both products need a default consensus on this rig.');
			const source = sourceSpread.centre,
				targetValues = targetSpread.centre;
			const distance = responseDistance(source, targetValues, { frequencies: GRID, maxHz: 10000 });
			before = distance?.distance ?? null;
			const alignedTarget = Float64Array.from(targetValues, (v) => v + (distance?.offset ?? 0));
			const corrected = Float64Array.from(source, (v, i) => v + (response.result.response[i] ?? NaN));
			const offset =
				responseDistance(corrected, alignedTarget, { frequencies: GRID, maxHz: 10000 })?.offset ?? 0;
			const attribution = (data: ProductDetail, ids: string[]) =>
				data.measurements
					.filter((m) => ids.includes(m.measurement.id))
					.map((m) => `${m.source.name} ${m.measurement.provenance.databaseUrl}`)
					.join('; ');
			series = [
				{
					id: 'original',
					label: `${product.product.brand} ${product.product.model} · original`,
					values: source,
					attribution: attribution(product, sourceSpread.measurementIds)
				},
				{
					id: 'target',
					label: `${target.product.brand} ${target.product.model} · target`,
					values: alignedTarget,
					reference: true,
					attribution: attribution(target, targetSpread.measurementIds)
				},
				{
					id: 'eq',
					label: 'With parametric EQ · level aligned',
					values: Float64Array.from(corrected, (v) => v - offset),
					attribution: 'Calculated at 48 kHz · not a new measurement'
				}
			];
			result = response;
		} catch (e) {
			if (token === request) error = String(e);
		} finally {
			if (token === request) busy = false;
		}
	}
	function download(text: string, extension: string) {
		const url = URL.createObjectURL(
			new Blob([text], { type: extension === 'json' ? 'application/json' : 'text/plain' })
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = `tonewave-${detail.product.id}-eq.${extension}`;
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<section class="eq stack" aria-labelledby="eq-heading" {@attach chartLegendNames}>
	<div>
		<p class="eyebrow">A measured approximation</p>
		<h2 id="eq-heading">EQ this toward…</h2>
	</div>
	<Notice kind="caution"
		>EQ toward a coupler measurement of another product approximates it on the rig; fit and unit variation
		still apply. It does not reproduce comfort, distortion or spatial perception.</Notice
	>
	<div class="eq-controls">
		<SearchCombobox
			{items}
			bind:query
			filter={false}
			label="EQ target product"
			emptyText="No other default product is available on this rig. Try another rig partition."
			onselect={(item: SearchItem) => void fit(item.id)}
		/><Slider
			label="Maximum filters"
			bind:value={maxFilters}
			min={3}
			max={10}
			onchange={(value: number) => {
				maxFilters = value;
			}}
		/><Button disabled={!targetId || busy} onclick={() => void fit()}
			>{busy ? 'Fitting EQ…' : 'Fit EQ'}</Button
		>
	</div>
	{#if busy}<p role="status">Fitting a constrained parametric EQ in your browser…</p>{/if}
	{#if error}<Notice kind="caution" title="EQ unavailable">{error}</Notice>{/if}
	{#if result}
		<p class="mono small">
			Response distance, 20 Hz–10 kHz: {before?.toFixed(1) ?? '—'} dB before → {result.result.residualDistanceDb.toFixed(
				1
			)} dB after. Preamp: {result.result.preamp.toFixed(1)} dB.
		</p>
		<p class="small muted">
			Level-aligned RMS shape residual, not a quality score. Filters and nominal headroom assume 48 kHz; they
			do not guarantee protection from clipping or hearing damage.
		</p>
		<div class="table-scroll">
			<table aria-label="Parametric EQ filters">
				<thead
					><tr
						><th scope="col">Filter</th><th scope="col">Type</th><th scope="col">Hz</th><th scope="col">Q</th
						><th scope="col">Gain (dB)</th></tr
					></thead
				><tbody
					>{#each result.result.filters as filter, i (`${i}-${filter.frequency}`)}<tr
							><th scope="row">{i + 1}</th><td>{filter.type}</td><td>{filter.frequency.toFixed(0)}</td><td
								>{filter.q.toFixed(2)}</td
							><td>{filter.gain.toFixed(1)}</td></tr
						>{/each}</tbody
				>
			</table>
		</div>
		{#if !result.result.filters.length}<p>
				No corrective filters were needed within the fitter’s limits.
			</p>{/if}
		<div class="row">
			<Button
				onclick={() => {
					download(result?.apo ?? '', 'txt');
				}}>Download Equalizer APO</Button
			><Button
				variant="quiet"
				onclick={() => {
					download(result?.wavelet ?? '', 'txt');
				}}>Download Wavelet GraphicEQ</Button
			><Button
				variant="quiet"
				onclick={() => {
					download(result?.json ?? '', 'json');
				}}>Download JSON</Button
			>
		</div>
		<details>
			<summary>Hard-to-correct regions</summary>
			<ul>
				{#each result.result.hardToCorrect as region, i (`${region.low}-${region.reason}-${i}`)}<li>
						{Math.round(region.low)}–{Math.round(region.high)} Hz · {region.reason.replaceAll('-', ' ')}
					</li>{/each}
			</ul>
			<p class="small muted">
				Notches are not boosted precisely, and high-frequency fitting is deliberately conservative.
			</p>
		</details>
		<FrChart {series} title="Original, target and EQ approximation" />
	{/if}
</section>

<style>
	.eq {
		border-top: 1px solid var(--line);
		padding-top: 40px;
		margin-top: 48px;
	}
	h2 {
		margin-top: 12px;
	}
	.eq-controls {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(220px, 0.7fr) auto;
		gap: 24px;
		align-items: end;
	}
	.table-scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}
	th,
	td {
		text-align: left;
		border-bottom: 1px solid var(--line);
		padding: 12px;
	}
	td {
		font-family: var(--mono);
	}
	@media (max-width: 900px) {
		.eq-controls {
			grid-template-columns: 1fr;
		}
	}
</style>
