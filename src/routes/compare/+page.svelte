<script lang="ts">
	import { browser, dev } from '$app/env';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import type { PathnameWithSearchOrHash } from '$app/types';
	import { SvelteMap, SvelteURL } from 'svelte/reactivity';
	import type { SearchItem } from '#lib/search.ts';
	import VisualHarness from '#lib/dev/VisualHarness.svelte';
	import SearchCombobox from '#lib/components/SearchCombobox.svelte';
	import FrChart from '#lib/components/FrChart.svelte';
	import SegmentedControl from '#lib/components/SegmentedControl.svelte';
	import Notice from '#lib/components/Notice.svelte';
	import Skeleton from '#lib/components/Skeleton.svelte';
	import Button from '#lib/components/Button.svelte';
	import { analysis, productList, formFromUrl } from '#lib/atlas.ts';
	import { catalogIdentity, productFor, channelSpread, mainPartition } from '#lib/product/data.ts';
	import type { CatalogIdentity } from '#lib/catalog/identity.ts';
	import { migrateUrl } from '#lib/catalog/migrate.ts';
	import { migrationMessages } from '#lib/catalog/notice.ts';
	import MigrationNote from '#lib/catalog/MigrationNote.svelte';
	import { rigLabel } from '#lib/rigs.ts';
	import { productSearch } from '#lib/product-search.ts';
	import {
		parseCompare,
		serialiseCompare,
		type CompareState,
		type Channel,
		type Smoothing
	} from '#lib/compare/url.ts';
	import type { AtlasSummary, ProductDetail, ProductListItem } from '#core/atlas/types.ts';
	import type { Measurement, Source } from '#core/dataset/types.ts';
	import type { FrSeries } from '#lib/chart.ts';
	import { GRID } from '#core/grid.ts';
	import { responseDistance } from '#core/analysis/distance.ts';
	import { makeWeights } from '#core/analysis/weights.ts';
	import { smoothOctave } from '#core/smooth.ts';
	interface Selection {
		id: string;
		productId: string;
		label: string;
		partition: string;
		sources: Source[];
		measurements: Measurement[];
		variant: string;
		series?: FrSeries;
		warning: string | undefined;
	}
	let form = $derived(browser ? formFromUrl(new URL(page.url.href)) : 'iem');
	let identity = $state.raw<CatalogIdentity>();
	let migrationNote = $state<string[]>([]);
	let selectionState = $derived(
		parseCompare(
			browser && identity
				? migrateUrl(new URL(page.url.href), identity).url.searchParams
				: new URLSearchParams(browser ? page.url.search : '')
		)
	);
	let products = $state.raw<ProductListItem[]>([]);
	let summary = $state.raw<AtlasSummary | null>(null);
	let selections = $state.raw<Selection[]>([]);
	let uploads = $state.raw<FrSeries[]>([]);
	let loading = $state(false);
	let error = $state('');
	let uploadError = $state('');
	let uploadMessages = $state<string[]>([]);
	let query = $state('');
	let mode = $state<'response' | 'difference'>('response');
	let baseline = $state('');
	const details = new SvelteMap<string, Promise<ProductDetail>>();
	const weights = makeWeights(GRID);
	let search = $derived(productSearch(products));
	let items = $derived(
		search(query, 60)
			.filter((p) => !selectionState.products.includes(p.id))
			.slice(0, 40)
			.map((p) => ({
				id: p.id,
				label: `${p.brand} ${p.model}`,
				sources: p.sourceCount,
				detail: p.partitions.map((rig) => rigLabel(rig, summary?.sources)).join(' / ')
			}))
	);
	let count = $derived(selectionState.products.length + selectionState.measurements.length + uploads.length);
	let partitions = $derived([...new Set(selections.filter((s) => s.series).map((s) => s.partition))]);
	let series = $derived.by(() => {
		const raw = [...selections.flatMap((s) => (s.series ? [s.series] : [])), ...uploads];
		const anchor = raw[0];
		return raw.map((s) => {
			const offset =
				anchor && s !== anchor
					? responseDistance(s.values, anchor.values, { frequencies: GRID, weights })?.offset
					: 0;
			const display = (values: Float64Array | Float32Array) => {
				const shifted = Float64Array.from(values, (v) => v - (offset ?? 0));
				return selectionState.smoothing ? smoothOctave(shifted, selectionState.smoothing) : shifted;
			};
			return {
				...s,
				values: display(s.values),
				...(s.lo ? { lo: display(s.lo) } : {}),
				...(s.hi ? { hi: display(s.hi) } : {})
			};
		});
	});
	function update(next: CompareState) {
		const url = new SvelteURL(page.url.href);
		url.search = serialiseCompare(next, url.searchParams).toString();
		void goto(resolve(`${url.pathname}${url.search}${url.hash}` as PathnameWithSearchOrHash), {
			replace: true,
			reset: false
		});
	}
	$effect(() => {
		const href = page.url.href,
			current = identity;
		if (!current) return;
		untrack(() => {
			const migrated = migrateUrl(new URL(href), current);
			const fresh = migrationMessages(migrated.messages);
			if (fresh.length) migrationNote = [...migrationNote, ...fresh];
			if (migrated.changed)
				void goto(
					resolve(
						`${migrated.url.pathname}${migrated.url.search}${migrated.url.hash}` as PathnameWithSearchOrHash
					),
					{ state: page.state, shallow: true, replace: true, reset: false }
				);
		});
	});
	$effect(() => {
		const selectedForm = form;
		const abort = new AbortController();
		products = [];
		summary = null;
		identity = undefined;
		error = '';
		void Promise.all([productList(selectedForm), analysis().then((service) => service.summary())])
			.then(async ([list, data]) => {
				const current = await catalogIdentity(selectedForm, data.version);
				if (!abort.signal.aborted) {
					identity = current;
					products = list;
					summary = data;
				}
			})
			.catch((e: unknown) => {
				if (!abort.signal.aborted) error = e instanceof Error ? e.message : String(e);
			});
		return () => {
			abort.abort();
		};
	});
	async function detail(id: string) {
		let pending = details.get(id);
		if (!pending) {
			pending = analysis().then(async (service) => {
				const result = await service.productDetail(id);
				if (!result.ok) throw new Error(result.message);
				return result;
			});
			details.set(id, pending);
			void pending.catch(() => details.delete(id));
		}
		return pending;
	}
	$effect(() => {
		const settings = selectionState,
			data = summary,
			list = products;
		const abort = new AbortController();
		selections = [];
		loading = false;
		if (!data) return;
		loading = true;
		error = '';
		void (async () => {
			const service = await analysis();
			const measurements = new Map(
				(await service.measurements([...settings.measurements])).map((measurement) => [
					measurement.id,
					measurement
				])
			);
			const rows: Selection[] = [];
			for (const id of [...settings.products, ...settings.measurements]) {
				const measurement = measurements.get(id);
				if (settings.measurements.includes(id) && !measurement)
					throw new Error(`Unknown product or measurement: ${id}`);
				const productId = measurement?.productId ?? id;
				const product = productFor(list, productId, identity);
				if (!product) throw new Error(`Unknown product or measurement: ${id}`);
				const result = await detail(productId);
				const partition = measurement?.partition ?? mainPartition(result);
				const spread = measurement ? null : await channelSpread(result, partition, settings.channel);
				const curve = measurement ? (await service.curves([id], { channel: settings.channel }))[0] : null;
				const values = curve?.values ?? spread?.centre;
				const warning = !values
					? `${product.brand} ${product.model}: no ${settings.channel} ${measurement ? 'curve' : 'default consensus'} is available. Choose another channel or measurement.`
					: undefined;
				const contributing = measurement
					? [measurement]
					: result.measurements
							.filter((r) => spread?.measurementIds.includes(r.measurement.id))
							.map((r) => r.measurement);
				const sources = data.sources.filter((s) => contributing.some((m) => m.sourceId === s.id));
				const label = `${product.brand} ${product.model}`;
				const variant = measurement
					? measurement.variantLabel || 'Default variant'
					: 'Product consensus · default variants';
				rows.push({
					id,
					productId,
					label,
					partition,
					sources,
					measurements: result.measurements.map((r) => r.measurement),
					variant,
					warning,
					...(values
						? {
								series: {
									id,
									label: `${label} · ${rigLabel(partition, data.sources)} · ${measurement ? variant : 'consensus'} · ${settings.channel}`,
									values,
									...(spread && spread.sourceCount >= 2 ? { lo: spread.min, hi: spread.max } : {}),
									attribution:
										sources.map((s) => `${s.name} ${s.url}`).join('; ') +
										` · ${variant} · ${rigLabel(partition, data.sources)}`
								}
							}
						: {})
				});
			}
			if (!abort.signal.aborted) selections = rows;
		})()
			.catch((e: unknown) => {
				if (!abort.signal.aborted) error = e instanceof Error ? e.message : String(e);
			})
			.finally(() => {
				if (!abort.signal.aborted) loading = false;
			});
		return () => {
			abort.abort();
		};
	});
	let urlDifference = $derived(selectionState.difference);
	$effect(() => {
		mode = urlDifference ? 'difference' : 'response';
		baseline = urlDifference;
	});
	$effect(() => {
		const difference = mode === 'difference' ? baseline || series[0]?.id || '' : '';
		if (difference !== selectionState.difference && !difference.startsWith('upload-'))
			update({ ...selectionState, difference });
	});
	function remove(id: string) {
		uploads = uploads.filter((s) => s.id !== id);
		update({
			...selectionState,
			products: selectionState.products.filter((p) => p !== id),
			measurements: selectionState.measurements.filter((m) => m !== id),
			difference: selectionState.difference === id ? '' : selectionState.difference
		});
	}
	function pick(row: Selection, value: string) {
		update({
			...selectionState,
			products: [
				...selectionState.products.filter((p) => p !== row.id),
				...(value === row.productId ? [value] : [])
			],
			measurements: [
				...selectionState.measurements.filter((m) => m !== row.id),
				...(value !== row.productId ? [value] : [])
			],
			difference: ''
		});
	}
	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || count >= 6) return;
		try {
			const result = await (await analysis()).parseUpload(await file.text(), file.name);
			uploadMessages = result.warnings;
			if (!result.ok) {
				uploadError = result.error;
				return;
			}
			if (count >= 6) {
				uploadError = 'Six curves selected. Remove one before adding this upload.';
				return;
			}
			uploadError = '';
			uploads = [
				...uploads,
				{
					id: result.uploadId,
					label: `Your upload: ${file.name}`,
					values: result.values,
					attribution: 'Local upload · rig unknown · never sent to a server'
				}
			];
		} catch (e) {
			uploadError = e instanceof Error ? e.message : String(e);
		}
	}
</script>

<svelte:head
	><title>Compare — Tonewave Atlas</title><meta
		name="description"
		content="Compare real frequency-response measurements, sources and rig-aware product consensus curves."
	/></svelte:head
>
{#if dev && page.url.searchParams.has('visual')}
	<VisualHarness />
{:else}
	<div class="page">
		<div class="page-heading">
			<h1>Compare responses.</h1>
			<p>
				Add up to six products or measurements. Inspect differences, select variants and share the overlay.
			</p>
		</div>
		<MigrationNote
			messages={migrationNote}
			ondismiss={() => {
				migrationNote = [];
			}}
		/>
		<div class="compare-grid">
			<section class="stack" aria-label="Comparison selection">
				{#if count < 6}<SearchCombobox
						{items}
						bind:query
						filter={false}
						label="Add to comparison"
						shortcut
						loading={!summary}
						onselect={(item: SearchItem) => {
							update({ ...selectionState, products: [...selectionState.products, item.id] });
							query = '';
						}}
					/>{:else}<Notice>Six curves selected. Remove one to add another.</Notice>{/if}
				<div class="row spread">
					<h2 class="eyebrow">Selected curves</h2>
					<span class="small mono">{count} / 6</span>
				</div>
				{#if loading}<Skeleton rows={2} label="Loading measurements" />{/if}
				{#if error}<Notice kind="caution" title="Could not load comparison"
						><p>{error}</p>
						<Button
							variant="quiet"
							onclick={() => {
								update({ ...selectionState, products: [], measurements: [], difference: '' });
							}}>Clear selection</Button
						></Notice
					>{/if}
				{#each selections as row (row.id)}
					<div class="legend-row" data-testid="comparison-row">
						<h3>{row.label}</h3>
						<p class="small">{rigLabel(row.partition, summary?.sources)} · {row.variant}</p>
						{#if row.warning}<Notice kind="caution">{row.warning}</Notice>{/if}
						<details class="sources small muted">
							<summary>{row.sources.length} {row.sources.length === 1 ? 'reviewer' : 'reviewers'}</summary>
							<div class="source-links">
								{#each row.sources as source (source.id)}<a href={source.url} rel="external">{source.name}</a>
								{/each}
							</div>
						</details>
						<label class="field-label" for={`measurement-${row.id}`}>Measurement for {row.label}</label
						><select
							id={`measurement-${row.id}`}
							value={row.id}
							onchange={(e) => {
								pick(row, e.currentTarget.value);
							}}
							><option value={row.productId}>Product consensus · main rig</option
							>{#each row.measurements as m (m.id)}<option value={m.id}
									>{summary?.sources.find((s) => s.id === m.sourceId)?.name} · {m.variant.label || 'default'} ·
									{rigLabel(m.partition, summary?.sources)}</option
								>{/each}</select
						>
						<Button
							variant="quiet"
							aria-label={`Remove ${row.label}`}
							onclick={() => {
								remove(row.id);
							}}>Remove</Button
						>
					</div>
				{/each}
				{#each uploads as item (item.id)}<div class="legend-row">
						<h3>{item.label}</h3>
						<p class="small muted">Rig unknown · local only</p>
						<Button
							variant="quiet"
							onclick={() => {
								remove(item.id);
							}}>Remove upload</Button
						>
					</div>{/each}
				{#if !count}<p class="muted">
						Add a product to begin. Its default measurements form a consensus within its main rig partition.
					</p>{/if}
				<SegmentedControl
					label="Measurement channel"
					value={selectionState.channel}
					options={[
						{ value: 'avg', label: 'Average' },
						{ value: 'L', label: 'Left' },
						{ value: 'R', label: 'Right' }
					]}
					onchange={(channel: Channel) => {
						update({ ...selectionState, channel });
					}}
				/>
				<label class="field-label" for="smoothing">Display smoothing</label><select
					id="smoothing"
					value={selectionState.smoothing}
					onchange={(e) => {
						update({ ...selectionState, smoothing: Number(e.currentTarget.value) as Smoothing });
					}}
					><option value="0">None</option>{#each [24, 12, 6, 3] as fraction (fraction)}<option
							value={fraction}>1/{fraction} octave</option
						>{/each}</select
				>
				<details>
					<summary>Level alignment & spread</summary>
					<p class="small muted">
						Curves are aligned to the first using the response-distance weighted least-squares offset across
						20 Hz–20 kHz, with balanced focus and conservative reliability weights. Smoothing is display-only.
						Shading is the observed default-measurement min/max when at least two sources contribute, not a
						confidence interval. Missing overlap is not extrapolated.
					</p>
				</details>
				<div>
					<label class="field-label" for="upload">Add your own measurement</label><input
						id="upload"
						type="file"
						accept=".txt,.csv,.tsv,.frd"
						disabled={count >= 6}
						onchange={upload}
					/>
					<p class="small muted">
						Processed in your browser, never sent anywhere. Uploads are not included in the URL.
					</p>
				</div>
				{#each uploadMessages as warning (warning)}<Notice kind="caution">{warning}</Notice>{/each}
				{#if uploadError}<Notice kind="caution" title="Could not add upload"><p>{uploadError}</p></Notice
					>{/if}
			</section>
			<div class="chart stack">
				{#if partitions.length > 1}<Notice kind="caution"
						>These curves were measured on different rigs ({partitions
							.map((rig) => rigLabel(rig, summary?.sources))
							.join(' vs ')}); differences may reflect the rig rather than the product. They are overlaid for
						inspection, not ranked or pooled.</Notice
					>{/if}
				<FrChart
					{series}
					title="Comparison workspace"
					bind:mode
					bind:baselineId={baseline}
					emptyText="Add a product or upload a measurement to inspect its response."
				/>
				<Notice kind="caution"
					>A measurement is not an ear. Fit, seal and insertion depth matter; response above 8 kHz is less
					reliable.</Notice
				>
			</div>
		</div>
	</div>
{/if}

<style>
	.compare-grid {
		display: grid;
		grid-template-columns: 300px minmax(0, 1fr);
		gap: 48px;
		align-items: start;
	}
	.compare-grid > section {
		min-width: 0;
	}
	.sources {
		margin-top: 8px;
	}
	.sources summary {
		cursor: pointer;
	}
	.source-links {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		margin: 8px 0;
	}
	.sources a {
		overflow-wrap: anywhere;
	}
	.legend-row {
		border-top: 1px solid var(--line);
		padding-top: 20px;
	}
	.legend-row h3 {
		margin-bottom: 8px;
	}
	.legend-row .field-label {
		margin-top: 12px;
	}
	.legend-row :global(.button) {
		margin-top: 12px;
	}
	select,
	input[type='file'] {
		width: 100%;
		min-width: 0;
	}
	input[type='file'] {
		font-size: var(--text-sm);
	}
	.chart {
		position: sticky;
		z-index: var(--z-sticky);
		top: 24px;
		min-width: 0;
	}
	.chart :global(.plot) {
		height: 364px;
	}
	details p {
		margin-top: 12px;
	}
	@media (max-width: 1050px) {
		.compare-grid {
			grid-template-columns: 260px minmax(0, 1fr);
			gap: 28px;
		}
	}
	@media (max-width: 900px) {
		.compare-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.chart {
			position: static;
		}
		.chart :global(.plot) {
			height: 300px;
		}
	}
	@media (max-width: 640px) {
		.chart :global(.plot) {
			height: 244px;
		}
	}
</style>
