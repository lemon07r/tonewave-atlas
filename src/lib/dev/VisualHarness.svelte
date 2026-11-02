<script lang="ts">
	import { GRID } from '#core/grid.ts';
	import type { FrSeries } from '#lib/chart.ts';
	import FrChart from '#lib/components/FrChart.svelte';
	import SearchCombobox from '#lib/components/SearchCombobox.svelte';
	import type { SearchItem } from '#lib/search.ts';
	import Button from '#lib/components/Button.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Rating from '#lib/components/Rating.svelte';
	import TagPicker from '#lib/components/TagPicker.svelte';
	import Slider from '#lib/components/Slider.svelte';
	import Toggle from '#lib/components/Toggle.svelte';
	import Disclosure from '#lib/components/Disclosure.svelte';
	import Tooltip from '#lib/components/Tooltip.svelte';
	import Popover from '#lib/components/Popover.svelte';
	import Menu from '#lib/components/Menu.svelte';
	import Toast from '#lib/components/Toast.svelte';
	import Notice from '#lib/components/Notice.svelte';
	import Skeleton from '#lib/components/Skeleton.svelte';
	const bump = (hz: number, centre: number, width: number, gain: number) =>
		gain * Math.exp(-0.5 * (Math.log2(hz / centre) / width) ** 2);
	const target = Float64Array.from(
		GRID,
		(hz) =>
			5 / (1 + (hz / 180) ** 2) + bump(hz, 2800, 0.8, 8) + bump(hz, 8000, 0.35, 3) - bump(hz, 15000, 0.65, 7)
	);
	const first = Float64Array.from(
		GRID,
		(hz, i) => (target[i] ?? 0) + bump(hz, 90, 0.9, 1.8) - bump(hz, 3500, 0.5, 1.5) + bump(hz, 6500, 0.2, 2)
	);
	const second = Float32Array.from(GRID, (hz, i) =>
		hz > 16500
			? NaN
			: (target[i] ?? 0) - bump(hz, 120, 1.1, 2.5) + bump(hz, 4200, 0.5, 2.4) - bump(hz, 8000, 0.2, 3)
	);
	const third = Float64Array.from(GRID, (hz, i) =>
		i > 160 && i < 166
			? NaN
			: (target[i] ?? 0) + bump(hz, 800, 1, 1.8) - bump(hz, 2500, 0.7, 2.8) + bump(hz, 10000, 0.3, 3.5)
	);
	const series: FrSeries[] = [
		{
			id: 'a',
			label: 'Study A · warm balance',
			values: first,
			lo: Float64Array.from(first, (v, i) => v - (i > 180 ? 2.2 : 0.8)),
			hi: Float64Array.from(first, (v, i) => v + (i > 180 ? 2.2 : 0.8)),
			attribution: 'Synthetic fixture, not a real product or measurement.'
		},
		{ id: 'b', label: 'Study B · presence emphasis', values: second },
		{ id: 'c', label: 'Study C · relaxed upper mids', values: third },
		{ id: 'target', label: 'Illustrative reference', values: target, reference: true }
	];
	let toast = $state(false);
	let selection = $state('No item selected');
	let loading = $state(false);
	const items = [
		{ id: '1', label: 'Studio study A', group: 'Synthetic products', variants: 2, sources: 3 },
		{ id: '2', label: 'Studio study B', group: 'Synthetic products', variants: 1, sources: 2 },
		{ id: '3', label: 'Reference curve', group: 'References', detail: 'Illustration only' }
	];
</script>

<div class="page">
	<div class="page-heading">
		<p class="eyebrow">Development only / Visual calibration</p>
		<h1>Sound, in perspective.</h1>
		<p>Synthetic curves for visual and interaction testing. These are not product measurements.</p>
	</div>
	<div class="harness-grid">
		<div>
			<FrChart
				{series}
				regions
				attribution="Tonewave Atlas · Synthetic visual fixture · Not measurement data"
			/>
		</div>
		<section class="stack" aria-label="Component specimens">
			<h2>Instrument panel</h2>
			<SearchCombobox
				{items}
				{loading}
				label="Search synthetic fixtures"
				placeholder="Try “study”"
				shortcut
				onselect={(item: SearchItem) => (selection = item.label)}
			/>
			<p class="small muted">{selection}</p>
			<Rating /><TagPicker options={['Bass weight', 'Vocal balance', 'Treble texture']} /><Slider
				label="Region weight"
				value={50}
				unit="%"
			/>
			<div class="row">
				<Button onclick={() => (toast = true)}>Save preference</Button><Button variant="quiet"
					>Quiet action</Button
				><Tooltip
					label="About this panel"
					text="These controls are reusable components. Nothing here is a listening recommendation."
					><Icon name="info" size={18} /></Tooltip
				>
			</div>
			<Toggle label="Simulate search loading" bind:checked={loading} />
			<div class="row">
				<Popover label="About this fixture"
					><p class="small">A native popover. Escape and outside clicks dismiss it.</p></Popover
				><Menu
					label="Actions"
					items={[
						{ label: 'Show notification', action: () => (toast = true) },
						{ label: 'Unavailable action', disabled: true, action: () => {} }
					]}
				/>
			</div>
			<Disclosure
				><Notice kind="caution" title="Upper treble is uncertain"
					>Insertion and rig differences can dominate this region.</Notice
				><Skeleton rows={2} /></Disclosure
			>
		</section>
	</div>
</div>
{#if toast}<Toast
		message="Preference saved in this demo."
		onundo={() => (toast = false)}
		ondismiss={() => (toast = false)}
	/>{/if}

<style>
	.page-heading {
		margin-bottom: 28px;
		max-width: none;
	}
	.page-heading h1 {
		font-size: 32px;
	}
	.page-heading p:not(.eyebrow) {
		max-width: none;
	}
	.harness-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
		gap: 48px;
		align-items: start;
	}
	@media (max-width: 900px) {
		.harness-grid {
			grid-template-columns: 1fr;
			gap: 40px;
		}
	}
</style>
