<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import uPlot from 'uplot';
	import { GRID } from '#core/grid.ts';
	import {
		chartValues,
		chartRange,
		frequencyLabel,
		dbLabel,
		FREQUENCY_TICKS,
		curveDash as dash,
		nearestFrequencyIndex,
		REGIONS,
		type FrSeries
	} from '#lib/chart.ts';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import Toggle from './Toggle.svelte';
	import SegmentedControl from './SegmentedControl.svelte';
	import Disclosure from './Disclosure.svelte';
	import Notice from './Notice.svelte';
	let {
		series = [],
		frequencies = GRID,
		title = 'Frequency response',
		emptyText = 'No curve yet — pick an IEM to see its measured response.',
		summary = 'Frequency-response curves show relative level across frequency, not how a product will sound in your ear.',
		mode = $bindable('response'),
		baselineId = $bindable(''),
		regions = $bindable(false),
		attribution = 'Tonewave Atlas · See sources and limitations at /method',
		controls = true
	}: {
		series?: readonly FrSeries[];
		frequencies?: Float64Array;
		title?: string;
		emptyText?: string;
		summary?: string;
		mode?: 'response' | 'difference';
		baselineId?: string;
		regions?: boolean;
		attribution?: string;
		controls?: boolean;
	} = $props();
	const id = $props.id();
	let host: HTMLDivElement;
	let plot: uPlot | undefined;
	let themeStyle = $state<CSSStyleDeclaration | null>(null);
	let hidden = $state<string[]>([]);
	let inspectedHz = $state(1000);
	let activeRegion = $state<number | null>(null);
	let exportError = $state('');
	let size = $derived(frequencies.length);
	let inspected = $derived(nearestFrequencyIndex(frequencies, inspectedHz));
	let levelLabel = $derived(mode === 'difference' ? 'Difference (dB)' : 'Level (dB)');
	let baseline = $derived(series.find((item) => item.id === baselineId) ?? series[0]);
	let partialEnvelope = $derived(series.some((item) => Boolean(item.lo) !== Boolean(item.hi)));
	let valid = $derived(
		size > 1 &&
			Array.from(frequencies).every(
				(hz, i) => Number.isFinite(hz) && hz > 0 && (i === 0 || hz > (frequencies[i - 1] ?? 0))
			) &&
			!partialEnvelope &&
			series.every(
				(item) =>
					item.values.length === size &&
					(!item.lo || item.lo.length === size) &&
					(!item.hi || item.hi.length === size)
			)
	);
	let curves = $derived(
		valid
			? series.map((item, index) => ({
					...item,
					index,
					data: chartValues(item.values, mode === 'difference' ? baseline?.values : undefined, size),
					low: item.lo
						? chartValues(item.lo, mode === 'difference' ? baseline?.values : undefined, size)
						: null,
					high: item.hi
						? chartValues(item.hi, mode === 'difference' ? baseline?.values : undefined, size)
						: null
				}))
			: []
	);
	let octaveIndices = $derived(
		Array.from({ length: Math.min(10, size) }, (_, i) => Math.floor((i * size) / Math.min(10, size)))
	);
	const compactRegionLabels = ['Sub', 'Bass', 'Low', 'Vocal', 'Upper', 'Treb.', 'Air'];
	function colour(index: number) {
		return `var(--curve-${(index % 7) + 1})`;
	}
	function focusSeries(index: number | null) {
		plot?.setSeries(index === null ? null : index + 1, { focus: true });
	}
	function setIndex(index: number) {
		const readIndex = Math.min(size - 1, Math.max(0, index));
		inspectedHz = frequencies[readIndex] ?? 1000;
		if (plot) {
			const hz = frequencies[readIndex];
			if (hz !== undefined)
				plot.setCursor({ left: plot.valToPos(hz, 'x'), top: plot.bbox.height / uPlot.pxRatio / 2 });
		}
	}
	onMount(() => {
		themeStyle = getComputedStyle(host);
		void document.fonts.ready.then(() => {
			plot?.redraw(true, true);
		});
		const observer = new MutationObserver(() => {
			themeStyle = getComputedStyle(host);
		});
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
		return () => {
			observer.disconnect();
		};
	});
	$effect(() => {
		if (!themeStyle || !valid) return;
		const current = curves;
		const invisible = hidden;
		const showRegions = regions;
		const style = themeStyle;
		const ink = style.getPropertyValue('--muted').trim();
		const line = style.getPropertyValue('--line').trim();
		const colours = current.map((curve) => style.getPropertyValue(`--curve-${(curve.index % 7) + 1}`).trim());
		const range = chartRange(
			current
				.filter((curve) => !invisible.includes(curve.id))
				.flatMap((curve) => [curve.data, ...(curve.low && curve.high ? [curve.low, curve.high] : [])])
		);
		function decorations(chart: uPlot) {
			const ctx = chart.ctx;
			ctx.save();
			ctx.beginPath();
			ctx.rect(chart.bbox.left, chart.bbox.top, chart.bbox.width, chart.bbox.height);
			ctx.clip();
			if (showRegions)
				REGIONS.forEach((region, index) => {
					if (index % 2 === 0) {
						const x = chart.valToPos(region.lo, 'x', true);
						const end = chart.valToPos(region.hi, 'x', true);
						ctx.fillStyle = line;
						ctx.globalAlpha = 0.16;
						ctx.fillRect(x, chart.bbox.top, end - x, chart.bbox.height);
					}
				});
			ctx.globalAlpha = 1;
			current.forEach((curve, index) => {
				if (!curve.low || !curve.high || invisible.includes(curve.id)) return;
				const low = curve.low,
					high = curve.high;
				ctx.fillStyle = colours[index] ?? ink;
				ctx.globalAlpha = 0.13;
				let start = 0;
				while (start < size) {
					while (start < size && (low[start] == null || high[start] == null)) start++;
					let end = start;
					while (end < size && low[end] != null && high[end] != null) end++;
					if (end - start > 1) {
						ctx.beginPath();
						for (let i = start; i < end; i++) {
							const hz = frequencies[i],
								value = high[i];
							if (hz !== undefined && value != null) {
								const x = chart.valToPos(hz, 'x', true),
									y = chart.valToPos(value, 'y', true);
								if (i === start) ctx.moveTo(x, y);
								else ctx.lineTo(x, y);
							}
						}
						for (let i = end - 1; i >= start; i--) {
							const hz = frequencies[i],
								value = low[i];
							if (hz !== undefined && value != null)
								ctx.lineTo(chart.valToPos(hz, 'x', true), chart.valToPos(value, 'y', true));
						}
						ctx.closePath();
						ctx.fill();
					}
					start = end + 1;
				}
			});
			ctx.restore();
		}
		const chart = new uPlot(
			{
				width: Math.max(240, host.clientWidth),
				height: host.clientHeight,
				padding: [16, 18, 4, 0],
				legend: { show: false },
				select: { show: false, left: 0, top: 0, width: 0, height: 0 },
				cursor: { drag: { x: false, y: false }, points: { size: 6, width: 1 }, focus: { prox: -1 } },
				focus: { alpha: 0.18 },
				scales: {
					// uPlot's ambient const enum is type-only under verbatimModuleSyntax; 3 = logarithmic.
					// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-assignment -- uPlot's documented numeric API.
					x: { time: false, distr: 3, log: 10, range: () => [20, 20000] },
					y: { range: () => range }
				},
				axes: [
					{
						stroke: ink,
						grid: { show: true, stroke: line, width: 0.5 },
						ticks: { stroke: line, width: 1, size: 5 },
						splits: () => FREQUENCY_TICKS,
						// Keep the explicit audio ticks; uPlot's default log filter only labels decades.
						filter: (_, splits) => splits,
						values: (_, splits) => splits.map(frequencyLabel),
						font: '11px "IBM Plex Mono"',
						gap: 8,
						size: 36,
						space: 30
					},
					{
						stroke: ink,
						grid: { stroke: line, width: 1, dash: [2, 4] },
						ticks: { show: false },
						values: (_, splits) => splits.map((value) => `${value}`),
						font: '11px "IBM Plex Mono"',
						size: 42,
						gap: 10,
						space: 44
					}
				],
				series: [
					{},
					...current.map((curve, index) => ({
						label: curve.label,
						stroke: colours[index] ?? ink,
						width: curve.reference ? 2 : 2.4,
						dash: dash(curve.index),
						show: !invisible.includes(curve.id),
						spanGaps: false,
						points: { show: false }
					}))
				],
				hooks: {
					drawAxes: [decorations],
					setCursor: [
						(chart) => {
							if (chart.cursor.idx != null && (chart.cursor.left ?? -1) >= 0)
								inspectedHz = frequencies[chart.cursor.idx] ?? inspectedHz;
						}
					]
				}
			},
			[Array.from(frequencies), ...current.map((curve) => curve.data)],
			host
		);
		plot = chart;
		const resize = new ResizeObserver(() => {
			if (host.clientWidth > 0) chart.setSize({ width: host.clientWidth, height: host.clientHeight });
		});
		resize.observe(host);
		return () => {
			resize.disconnect();
			chart.destroy();
			if (plot === chart) plot = undefined;
		};
	});
	async function exportPng() {
		if (!plot) return;
		exportError = '';
		try {
			await document.fonts.ready;
			const source = plot.ctx.canvas;
			const scale = uPlot.pxRatio;
			const width = Math.max(plot.width, 640);
			const notes = [
				attribution,
				...series.filter((item) => item.attribution).map((item) => `${item.label}: ${item.attribution ?? ''}`)
			];
			const style = getComputedStyle(host);
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Canvas export is unavailable.');
			function wrap(text: string, maxWidth: number, font: string): string[] {
				if (!ctx) return [];
				ctx.font = font;
				const lines: string[] = [];
				let line = '';
				// Character wrapping also preserves long source URLs without clipping attribution.
				for (const character of text) {
					if (line && ctx.measureText(line + character).width > maxWidth) {
						lines.push(line.trimEnd());
						line = character.trimStart();
					} else line += character;
				}
				if (line) lines.push(line);
				return lines;
			}
			const headings = wrap(
				`${title}${mode === 'difference' ? ` · difference from ${baseline?.label ?? ''}` : ''}`,
				width - 48,
				'500 18px "DM Sans Variable"'
			);
			const legends = series.map((item, index) =>
				wrap(
					`${index + 1}. ${item.label}${hidden.includes(item.id) ? ' (hidden)' : ''}`,
					width - 108,
					'13px "DM Sans Variable"'
				)
			);
			const sourceNotes = notes.map((note) => wrap(note, width - 48, '11px "DM Sans Variable"'));
			const chartTop = 46 + headings.length * 22;
			const chartHeight = (plot.height * width) / plot.width;
			canvas.width = width * scale;
			canvas.height =
				(chartTop +
					chartHeight +
					36 +
					legends.reduce((sum, lines) => sum + lines.length * 18 + 6, 0) +
					sourceNotes.reduce((sum, lines) => sum + lines.length * 14 + 6, 0)) *
				scale;
			ctx.scale(scale, scale);
			ctx.fillStyle = style.getPropertyValue('--paper');
			ctx.fillRect(0, 0, canvas.width / scale, canvas.height / scale);
			ctx.fillStyle = style.getPropertyValue('--ink');
			ctx.font = '500 18px "DM Sans Variable"';
			headings.forEach((line, index) => {
				ctx.fillText(line, 24, 32 + index * 22);
			});
			ctx.font = '12px "IBM Plex Mono"';
			ctx.fillText(`${levelLabel} · Frequency (Hz)`, 24, chartTop - 12);
			ctx.drawImage(source, 0, chartTop, width, chartHeight);
			let y = chartTop + chartHeight + 24;
			series.forEach((item, index) => {
				ctx.lineWidth = item.reference ? 1.5 : 2;
				ctx.strokeStyle = style.getPropertyValue(`--curve-${(index % 7) + 1}`);
				ctx.setLineDash(dash(index));
				ctx.beginPath();
				ctx.moveTo(24, y - 4);
				ctx.lineTo(72, y - 4);
				ctx.stroke();
				ctx.setLineDash([]);
				ctx.fillStyle = style.getPropertyValue('--ink');
				ctx.font = '13px "DM Sans Variable"';
				for (const line of legends[index] ?? []) {
					ctx.fillText(line, 84, y);
					y += 18;
				}
				y += 6;
			});
			ctx.font = '11px "DM Sans Variable"';
			ctx.fillStyle = style.getPropertyValue('--muted');
			for (const noteLines of sourceNotes) {
				for (const line of noteLines) {
					ctx.fillText(line, 24, y);
					y += 14;
				}
				y += 6;
			}
			const url = canvas.toDataURL('image/png');
			const link = document.createElement('a');
			link.href = url;
			link.download = 'tonewave-atlas-response.png';
			link.click();
		} catch {
			exportError = 'Could not export this chart. Please try again.';
		}
	}
</script>

<figure class="fr-chart" aria-labelledby={`${id}-title`} aria-describedby={`${id}-summary`}>
	<div class="chart-heading">
		<div>
			<p class="eyebrow">20 Hz — 20 kHz</p>
			<h2 id={`${id}-title`}>{title}</h2>
		</div>
		{#if controls}<Button
				variant="icon"
				aria-label="Export chart as PNG"
				disabled={series.length === 0 || !valid}
				onclick={() => void exportPng()}><Icon name="download" size={18} /></Button
			>{/if}
	</div>
	<p id={`${id}-summary`} class="sr-only">
		{summary}
		{#if !valid}Chart data and its table are unavailable because the supplied curves or uncertainty bounds are
			invalid.
		{:else}{series.length}
			{series.length === 1 ? 'curve' : 'curves'}. {mode === 'difference'
				? `Values are subtracted from ${baseline?.label ?? 'the baseline'} at each frequency, with no additional alignment.`
				: 'Missing measurements remain gaps.'}
			{series.length > 0 ? 'A data table is available below.' : 'No measurements selected.'}{/if}
	</p>
	{#if controls && series.length > 0}<div class="chart-controls">
			<SegmentedControl
				label="Chart mode"
				options={[
					{ value: 'response', label: 'Response' },
					{ value: 'difference', label: 'Difference' }
				]}
				bind:value={mode}
			/><Toggle label="Regions" bind:checked={regions} />{#if mode === 'difference'}<label
					class="baseline-label"
					>Baseline<select
						aria-label="Difference baseline"
						value={baseline?.id}
						onchange={(event) => (baselineId = event.currentTarget.value)}
						>{#each series as item (item.id)}<option value={item.id}>{item.label}</option>{/each}</select
					></label
				>{/if}
		</div>{/if}
	<div class="axis-label">{levelLabel}</div>
	<div class="plot-wrap">
		<div class="plot" bind:this={host} aria-hidden="true"></div>
		{#if series.length === 0}<div class="plot-empty">
				<div class="empty-label">
					<p>{emptyText}</p>
				</div>
			</div>{/if}
	</div>
	<div class="x-label">Frequency (Hz)</div>
	{#if regions}<div class="regions" role="group" aria-label="Frequency regions">
			{#each REGIONS as region, i (region.label)}<button
					type="button"
					style:flex={Math.log(region.hi / region.lo)}
					aria-describedby={`${id}-region-description`}
					class:active={activeRegion === i}
					onpointerenter={() => (activeRegion = i)}
					onpointerleave={() => (activeRegion = null)}
					onfocus={() => (activeRegion = i)}
					onblur={() => (activeRegion = null)}
					onclick={() => (activeRegion = i)}
					onkeydown={(event) => {
						if (event.key === 'Escape') activeRegion = null;
					}}
					aria-label={`${region.label}, ${region.lo} to ${region.hi} Hz`}
					><span class="region-label-wide">{region.short}</span><span class="region-label-compact"
						>{compactRegionLabels[i] ?? region.short}</span
					></button
				>{/each}
		</div>
		<p class="region-description" id={`${id}-region-description`}>
			{activeRegion === null
				? 'Hover or focus a region to learn what a difference there may mean.'
				: REGIONS[activeRegion]?.description}
		</p>{/if}
	{#if series.length > 0 && valid}<div class="readout-heading">
			<label for={`${id}-frequency`}>Inspect frequency</label><span class="mono"
				>{Math.round(frequencies[inspected] ?? 20)} Hz</span
			>
		</div>
		<input
			class="frequency-scrubber"
			id={`${id}-frequency`}
			type="range"
			min="0"
			max={size - 1}
			value={inspected}
			aria-valuetext={`${Math.round(frequencies[inspected] ?? 20)} hertz`}
			oninput={(event) => {
				setIndex(event.currentTarget.valueAsNumber);
			}}
		/>
		<div class="legend" role="group" aria-label="Chart series">
			{#each curves as curve (curve.id)}<div
					class:hidden-series={hidden.includes(curve.id)}
					class="legend-row"
				>
					<button
						type="button"
						aria-pressed={!hidden.includes(curve.id)}
						title={curve.reference ? 'Reference curve' : undefined}
						onpointerenter={() => {
							focusSeries(curve.index);
						}}
						onpointerleave={() => {
							focusSeries(null);
						}}
						onfocus={() => {
							focusSeries(curve.index);
						}}
						onblur={() => {
							focusSeries(null);
						}}
						onclick={() =>
							(hidden = hidden.includes(curve.id)
								? hidden.filter((item) => item !== curve.id)
								: [...hidden, curve.id])}
						><svg width="48" height="10" aria-hidden="true"
							><line
								x1="0"
								x2="48"
								y1="5"
								y2="5"
								stroke={colour(curve.index)}
								stroke-width="2"
								stroke-dasharray={dash(curve.index).join(' ')}
							/></svg
						><span class="legend-number">{curve.index + 1}</span><span
							>{curve.label}{#if curve.reference}<span class="reference-label" aria-hidden="true"
									>Reference</span
								>{/if}</span
						></button
					><span class="legend-value"
						>{mode === 'difference' ? 'Δ ' : ''}{dbLabel(curve.data[inspected], mode === 'difference')}
						<span class="muted">dB</span></span
					>
				</div>{/each}
		</div>
		<Disclosure label="View chart data"
			><!-- svelte-ignore a11y_no_noninteractive_tabindex (Overflowing table must be keyboard-scrollable.) -->
			<div class="table-scroll" tabindex="0" role="region" aria-label="Frequency response data table">
				<table class="data-table">
					<caption
						>Log-spaced samples on the supplied grid: {levelLabel} against Frequency (Hz). A dash means no measurement.
						The full chart uses {size} points; no values are extrapolated.</caption
					><thead
						><tr
							><th scope="col">Frequency (Hz)</th>{#each curves as curve (curve.id)}<th scope="col"
									>{curve.label}</th
								>{/each}</tr
						></thead
					><tbody
						>{#each octaveIndices as index (index)}<tr
								><th scope="row">{frequencyLabel(frequencies[index] ?? 20)} Hz</th
								>{#each curves as curve (curve.id)}<td>{dbLabel(curve.data[index], mode === 'difference')}</td
									>{/each}</tr
							>{/each}</tbody
					>
				</table>
			</div></Disclosure
		>{/if}
	{#if !valid}<Notice kind="caution"
			>Chart unavailable: {partialEnvelope
				? 'lower and upper uncertainty bounds must be supplied together.'
				: `every curve and uncertainty bound must use the ${size}-point frequency grid.`}</Notice
		>{/if}
	{#if exportError}<p class="small" role="alert">{exportError}</p>{/if}
	<figcaption><a href={resolve('/method')}>Sources and limitations</a></figcaption>
</figure>

<style>
	.fr-chart {
		background: var(--surface);
		border: var(--hairline) solid var(--line);
		border-radius: var(--radius);
		padding: 24px;
		min-width: 0;
	}
	.chart-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		margin-bottom: 16px;
	}
	.chart-heading .eyebrow {
		font-size: 10px;
		margin-bottom: 6px;
	}
	.chart-heading h2 {
		font-size: 20px;
	}
	.chart-heading :global(.button.icon) {
		border: 0;
	}
	.chart-controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 20px;
	}
	.axis-label,
	.x-label {
		color: var(--muted);
		font-size: 11px;
	}
	.axis-label {
		margin: 0 0 4px 4px;
	}
	.x-label {
		text-align: right;
		padding-right: 18px;
	}
	.plot-wrap {
		position: relative;
	}
	.plot {
		height: 280px;
		width: 100%;
	}
	.plot-empty {
		position: absolute;
		inset: 16px 18px 36px 42px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: 12px;
	}
	.empty-label {
		display: grid;
		justify-items: center;
		gap: 12px;
		padding: 16px;
		background: var(--surface);
	}
	.plot-empty p {
		font-size: var(--text-xs);
		color: var(--muted);
		max-width: 26ch;
	}
	:global(.uplot .u-cursor-x),
	:global(.uplot .u-cursor-y) {
		border-color: var(--strong-line);
	}
	.regions {
		display: flex;
		padding: 0 18px 0 42px;
		margin-top: 12px;
	}
	.regions button {
		padding: 6px 0;
		min-width: 0;
		min-height: 36px;
		border: 0;
		background: none;
		color: var(--muted);
		font-size: 9px;
		letter-spacing: -0.02em;
	}
	.regions button.active {
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.region-label-compact {
		display: none;
	}
	.region-description {
		font-size: var(--text-xs);
		color: var(--muted);
		min-height: 44px;
		padding-top: 12px;
	}
	.readout-heading {
		display: flex;
		justify-content: space-between;
		color: var(--muted);
		font-size: var(--text-xs);
		margin-top: 16px;
	}
	.readout-heading .mono {
		color: var(--ink);
	}
	.frequency-scrubber {
		width: 100%;
		accent-color: var(--accent);
		height: 24px;
		margin: 0 0 8px;
	}
	.legend {
		margin-bottom: 16px;
	}
	.legend-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
	}
	.legend-row button {
		display: flex;
		gap: 8px;
		align-items: center;
		text-align: left;
		background: none;
		border: 0;
		padding: 8px 0;
		color: var(--ink);
		font-size: var(--text-xs);
		min-height: 36px;
	}
	.legend-number {
		font: 10px var(--mono);
		color: var(--muted);
	}
	.legend-value {
		font: 11px var(--mono);
		white-space: nowrap;
		margin-left: auto;
	}
	.hidden-series button {
		text-decoration: line-through;
		color: var(--muted);
	}
	.hidden-series svg {
		opacity: 0.35;
	}
	caption {
		text-align: left;
		color: var(--muted);
		margin-bottom: 16px;
		line-height: 1.6;
	}
	figcaption {
		color: var(--muted);
		font-size: 10px;
		line-height: 1.6;
		margin-top: 16px;
	}
	figcaption a {
		color: var(--muted);
	}
	@media (min-width: 1200px) {
		.plot {
			height: 304px;
		}
	}
	@media (max-width: 640px) {
		.fr-chart {
			padding: 16px 12px;
		}
		.chart-heading {
			padding: 0 4px;
		}
		.chart-heading h2 {
			font-size: 18px;
		}
		.plot {
			height: 244px;
		}
		.region-description {
			min-height: 64px;
		}
		.regions button {
			min-height: 44px;
			font-size: 9px;
			padding: 6px 2px;
		}
		.region-label-wide {
			display: none;
		}
		.region-label-compact {
			display: inline;
		}
		.legend-value {
			font-size: 10px;
		}
		.legend-row button {
			font-size: 11px;
			gap: 6px;
		}
	}
</style>
