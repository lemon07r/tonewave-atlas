<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/env';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { PathnameWithSearchOrHash } from '$app/types';
	import { analysis, productList } from '#lib/atlas.ts';
	import type { Form } from '#core/dataset/types.ts';
	import type {
		AtlasSummary,
		ProductListItem,
		ProductDetail,
		SimilarResult,
		TasteResult,
		TasteItem,
		RankFilters
	} from '#core/atlas/types.ts';
	import type { Band } from '#core/analysis/common.ts';
	import { BANDS } from '#core/analysis/common.ts';
	import type { Focus } from '#core/analysis/weights.ts';
	import type { SearchItem } from '#lib/search.ts';
	import type { FrSeries } from '#lib/chart.ts';
	import SearchCombobox from '#lib/components/SearchCombobox.svelte';
	import SegmentedControl from '#lib/components/SegmentedControl.svelte';
	import Toggle from '#lib/components/Toggle.svelte';
	import Slider from '#lib/components/Slider.svelte';
	import Disclosure from '#lib/components/Disclosure.svelte';
	import Notice from '#lib/components/Notice.svelte';
	import Skeleton from '#lib/components/Skeleton.svelte';
	import FrChart from '#lib/components/FrChart.svelte';
	import Toast from '#lib/components/Toast.svelte';
	import ProfileEditor from '#lib/profile/ProfileEditor.svelte';
	import {
		PROFILE_KEY,
		PROFILE_LIMIT,
		emptyProfile,
		parseProfile,
		reasonLabels,
		type Profile
	} from '#lib/profile/profile.ts';
	import { bandLabels } from './describe.ts';
	import { confidenceReason, describeTaste, emptyTasteSummary } from './taste-wording.ts';
	import { rankToGrid } from './rank-to-grid.ts';
	import { alignDisplaySeries } from './align-display.ts';
	import { rigLabel } from '#lib/rigs.ts';
	import { candidateCurve, displayCurve, detail, curveSources, type CurveSource } from './display.ts';
	import ResultRow from './ResultRow.svelte';

	let { form }: { form: Form } = $props();
	type Choice = ProductListItem & SearchItem;
	function readState() {
		const p = browser ? page.url.searchParams : new URLSearchParams();
		const focus = p.get('focus');
		const alpha = Number(p.get('alpha'));
		const max = Number(p.get('max'));
		return {
			mode: p.get('mode') === 'profile' ? 'profile' : 'similar',
			ref: p.get('ref') ?? '',
			measurement: p.get('m') ?? '',
			rig: p.get('rig') ?? '',
			focus: (['bass', 'vocals', 'treble'].includes(focus ?? '') ? focus : 'balanced') as Focus,
			max: p.has('max') && Number.isFinite(max) && max >= 0 ? max : undefined,
			tunings: p.get('tunings') === '1',
			alpha: p.has('alpha') && alpha >= 1 && alpha <= 4 ? alpha : undefined,
			sources: (p.get('sources') ?? '').split(',').filter(Boolean),
			overlays: [...new Set((p.get('chart') ?? '').split(',').filter(Boolean))].slice(0, 5)
		};
	}
	let urlState = $derived(readState());
	let products = $state.raw<ProductListItem[]>([]);
	let summary = $state.raw<AtlasSummary>();
	let catalogLoading = $state(true);
	let catalogError = $state('');
	let ready = $state(false);
	let query = $state('');
	let profile = $state.raw<Profile>(emptyProfile());
	let storageError = $state('');
	let profileError = $state('');
	let undo = $state.raw<Profile>();
	let similar = $state.raw<SimilarResult>();
	let taste = $state.raw<TasteResult>();
	let queryError = $state('');
	let loading = $state(false);
	let referenceDetail = $state.raw<ProductDetail>();
	let referenceError = $state('');
	let series = $state.raw<FrSeries[]>([]);
	let provenance = $state.raw<CurveSource[]>([]);
	let chartError = $state('');
	let chartLoading = $state(false);
	let importInput = $state<HTMLInputElement>();
	let items = $derived(profile.profiles[form]);
	let hasPositive = $derived(
		items.some((i) => i.soundRelated && (i.rating === 'love' || i.rating === 'like'))
	);
	let choices = $derived(
		products
			.filter(
				(p) =>
					`${p.brand} ${p.model}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
					(urlState.mode !== 'profile' || !items.some((i) => i.productId === p.id))
			)
			.slice(0, 60)
			.map((p): Choice => ({
				...p,
				label: `${p.brand} ${p.model}`,
				group: p.brand,
				variants: p.variantLabels.length,
				sources: p.sourceCount
			}))
	);
	let selectedProduct = $derived(products.find((p) => p.id === urlState.ref));
	let referenceId = $derived(urlState.ref);
	let activeResult = $derived(urlState.mode === 'similar' ? similar : taste);
	let effectiveOverlays = $derived(
		urlState.overlays.filter((id) => activeResult?.results.some((row) => row.candidate.id === id))
	);
	let selectedCount = $derived(effectiveOverlays.length);
	let modelKey = $derived(JSON.stringify({ form, rig: urlState.rig, items }));
	// Cluster IDs are local to the form, requested rig and ordered rated evidence.
	let correctionBands = $state<Record<string, Partial<Record<number, Partial<Record<Band, number>>>>>>({});
	let currentCorrections = $derived(correctionBands[modelKey] ?? {});
	function querySpec() {
		return {
			mode: urlState.mode,
			ref: urlState.ref,
			measurement: urlState.measurement,
			rig: urlState.rig,
			focus: urlState.focus,
			alpha: urlState.alpha,
			filters: {
				includeTunings: urlState.tunings,
				...(urlState.max !== undefined ? { maxPriceUsd: urlState.max } : {}),
				...(urlState.sources.length ? { sources: urlState.sources } : {})
			} satisfies RankFilters,
			ratings: urlState.mode === 'profile' ? items : [],
			edits:
				urlState.mode === 'profile'
					? Object.entries(currentCorrections).map(([tasteId, bands]) => ({
							tasteId: Number(tasteId),
							bands: bands ?? {}
						}))
					: []
		};
	}
	let queryKey = $derived(JSON.stringify(querySpec()));
	const errorText = (cause: unknown) =>
		cause instanceof Error ? cause.message : 'The analysis could not be loaded. Please try again.';
	function nameFor(id: string): string {
		const product = products.find(
			(p) => p.id === id || p.id === items.find((i) => i.measurementId === id)?.productId
		);
		return product ? `${product.brand} ${product.model}` : id;
	}
	function changeUrl(changes: Record<string, string | undefined>, replace = false) {
		const url = new URL(page.url.href);
		for (const [key, value] of Object.entries(changes)) {
			if (value === undefined || value === '') url.searchParams.delete(key);
			else url.searchParams.set(key, value);
		}
		void goto(resolve(`/${url.search}` as PathnameWithSearchOrHash), { reset: false, replace });
	}
	function save(next: Profile) {
		profile = next;
		try {
			localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
			storageError = '';
		} catch {
			storageError = 'Browser storage is unavailable. Your edits work for this visit; export to keep them.';
		}
	}
	function updateItems(next: TasteItem[]) {
		save({ ...profile, profiles: { ...profile.profiles, [form]: next } });
	}
	function choose(product: Choice) {
		if (urlState.mode === 'profile') {
			if (items.length >= PROFILE_LIMIT) {
				profileError = `A profile supports at most ${PROFILE_LIMIT} products per form factor. Remove one before adding another.`;
				return;
			}
			profileError = '';
			updateItems([...items, { productId: product.id, rating: 'love', strength: 1, soundRelated: true }]);
			query = '';
		} else {
			changeUrl({ ref: product.id, m: undefined, rig: undefined, chart: undefined, sources: undefined });
		}
	}
	function toggleOverlay(id: string) {
		changeUrl(
			{
				chart: effectiveOverlays.includes(id)
					? effectiveOverlays.filter((x) => x !== id).join(',')
					: [...effectiveOverlays, id].slice(0, 5).join(',')
			},
			true
		);
	}
	function correct(tasteId: number, band: Band, value: number) {
		correctionBands = {
			...correctionBands,
			[modelKey]: { ...currentCorrections, [tasteId]: { ...currentCorrections[tasteId], [band]: value } }
		};
	}
	function exportProfile() {
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' })
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'tonewave-profile.json';
		link.click();
		URL.revokeObjectURL(url);
	}
	async function importProfile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			if (file.size > 1_000_000) throw new Error('Profile file is too large (maximum 1 MB).');
			const next = parseProfile(await file.text());
			undo = profile;
			save(next);
			profileError = '';
		} catch (cause) {
			profileError = `Import failed: ${errorText(cause)}`;
		}
		input.value = '';
	}
	onMount(() => {
		let current = true;
		try {
			const text = localStorage.getItem(PROFILE_KEY);
			if (text) profile = parseProfile(text);
		} catch (cause) {
			storageError = `Saved profile could not be read: ${errorText(cause)} It has not been overwritten. Edits work for this visit; export to keep them if browser storage remains unavailable.`;
		}
		ready = true;
		void Promise.all([productList(form), analysis().then((service) => service.summary())]).then(
			([list, info]) => {
				if (current) {
					products = list;
					summary = info;
					catalogLoading = false;
				}
			},
			(cause: unknown) => {
				if (current) {
					catalogError = errorText(cause);
					catalogLoading = false;
				}
			}
		);
		return () => {
			current = false;
		};
	});
	$effect(() => {
		const id = referenceId;
		referenceDetail = undefined;
		referenceError = '';
		if (!id || catalogLoading || catalogError || !selectedProduct) return;
		let current = true;
		void detail(id).then(
			(result) => {
				if (current) referenceDetail = result;
			},
			(cause: unknown) => {
				if (current) referenceError = errorText(cause);
			}
		);
		return () => {
			current = false;
		};
	});
	$effect(() => {
		if (!ready || catalogLoading || catalogError) return;
		const { mode, ref, measurement, rig, focus, alpha, filters, ratings, edits } = JSON.parse(
			queryKey
		) as ReturnType<typeof querySpec>;
		queryError = '';
		similar = undefined;
		taste = undefined;
		if (mode === 'similar' && ref && !selectedProduct) {
			queryError =
				'This reference is not in the selected form-factor catalog. Switch modes or choose another product.';
			loading = false;
			return;
		}
		if (
			(mode === 'similar' && !ref) ||
			(mode === 'profile' &&
				!ratings.some((i) => i.soundRelated && (i.rating === 'love' || i.rating === 'like')))
		) {
			loading = false;
			return;
		}
		loading = true;
		let current = true;
		const timer = window.setTimeout(
			() => {
				void (async () => {
					try {
						const service = await analysis();
						if (mode === 'similar') {
							const result = await service.similar({
								productId: ref,
								...(measurement ? { measurementId: measurement } : {}),
								...(rig ? { partition: rig } : {}),
								focus,
								...(alpha !== undefined ? { treblePenalty: alpha } : {}),
								filters,
								topK: 20
							});
							if (!current) return;
							if (!result.ok) queryError = result.message;
							else similar = result;
						} else {
							const result = await service.taste({
								items: ratings,
								...(rig ? { partition: rig } : {}),
								corrections: edits,
								filters,
								topK: 20
							});
							if (!current) return;
							if (!result.ok) queryError = result.message;
							else taste = result;
						}
					} catch (cause) {
						if (current) queryError = errorText(cause);
					} finally {
						if (current) loading = false;
					}
				})();
			},
			mode === 'profile' ? 300 : 100
		);
		return () => {
			current = false;
			clearTimeout(timer);
		};
	});
	$effect(() => {
		const result = activeResult;
		const overlays = urlState.overlays;
		const mode = urlState.mode;
		const displayFocus = mode === 'similar' ? urlState.focus : 'balanced';
		const sim = similar,
			model = taste;
		const measurement = urlState.measurement;
		series = [];
		provenance = [];
		chartError = '';
		if (!result) {
			chartLoading = false;
			return;
		}
		chartLoading = true;
		const controller = new AbortController();
		void (async () => {
			try {
				const base: FrSeries[] = [];
				const links: CurveSource[] = [];
				if (mode === 'similar' && sim?.reference.productId) {
					const displayed = await displayCurve(sim.reference.productId, sim.partition, {
						id: 'reference',
						reference: true,
						...(measurement ? { measurementIds: [measurement] } : {})
					});
					base.push(displayed.series);
					links.push(...displayed.sources);
				} else if (mode === 'profile' && model) {
					for (const target of model.model.tastes) {
						base.push({
							id: `taste-${target.id}`,
							label: `Taste ${target.id + 1} centre (derived)`,
							values: rankToGrid(target.centre),
							reference: true,
							attribution: `${rigLabel(model.partition, summary?.sources)} · derived, log-frequency interpolated; corrected by the analysis service`
						});
						for (const member of target.members) {
							const item = items.find((i) => (i.measurementId ?? i.productId) === member);
							if (!item) continue;
							const product = await detail(item.productId);
							const ids = item.measurementId
								? [item.measurementId]
								: (product.spread.find((s) => s.partition === model.partition)?.measurementIds ?? []);
							links.push(...curveSources(product, ids));
						}
					}
				}
				const candidates = result.results
					.filter((row) => overlays.includes(row.candidate.id))
					.map((row) => row.candidate);
				const displayed = await Promise.all(
					candidates.map((candidate) => candidateCurve(candidate, result.partition))
				);
				for (const curve of displayed) {
					base.push(curve.series);
					links.push(...curve.sources);
				}
				if (!controller.signal.aborted) {
					series = alignDisplaySeries(base, displayFocus);
					provenance = [...new Map(links.map((link) => [link.url, link])).values()];
				}
			} catch (cause) {
				if (!controller.signal.aborted) chartError = errorText(cause);
			} finally {
				if (!controller.signal.aborted) chartLoading = false;
			}
		})();
		return () => {
			controller.abort();
		};
	});
</script>

<div class="page discover">
	<div class="discover-grid">
		<section class="discovery-column" aria-label="Discover measured matches">
			<div class="page-heading">
				<p class="eyebrow">A listening atlas, not a leaderboard</p>
				<h1>Find {form === 'iem' ? 'IEMs' : 'headphones'} that<br />sound like…</h1>
				<p>Start with something you know. Compare measured response, not a promise of what you will hear.</p>
			</div>
			<SegmentedControl
				label="Discovery mode"
				options={[
					{ value: 'similar', label: form === 'iem' ? 'Similar to one IEM' : 'Similar to one headphone' },
					{ value: 'profile', label: 'Match my taste profile' }
				]}
				value={urlState.mode}
				onchange={(value) => {
					query = '';
					changeUrl({
						mode: value === 'profile' ? 'profile' : undefined,
						rig: undefined,
						chart: undefined,
						sources: undefined
					});
				}}
			/>
			<div class="search">
				<SearchCombobox
					items={choices}
					label={urlState.mode === 'profile'
						? `Add ${form === 'iem' ? 'an IEM' : 'a headphone'} to your profile`
						: form === 'iem'
							? 'An IEM you enjoy'
							: 'A headphone you enjoy'}
					placeholder="Search by brand or model"
					bind:query
					loading={catalogLoading}
					filter={false}
					shortcut
					onselect={choose}
				/>
				<p class="search-note">Matches use measurements from the same rig family.</p>
			</div>
			{#if catalogError}<Notice kind="caution">Catalog unavailable: {catalogError}</Notice>{/if}
			{#if urlState.mode === 'similar' && urlState.ref}<div class="reference">
					<h2>{nameFor(urlState.ref)}</h2>
					<p>
						Reference · {similar?.partition || urlState.rig
							? rigLabel(similar?.partition ?? urlState.rig, summary?.sources)
							: 'automatic rig selection'}
					</p>
					{#if (selectedProduct?.partitions.length ?? 0) > 1}<label class="field-label"
							>Measurement rig<select
								class="text-input"
								value={urlState.rig}
								onchange={(event) => {
									changeUrl({
										rig: event.currentTarget.value,
										m: undefined,
										chart: undefined,
										sources: undefined
									});
								}}
								><option value=""
									>Automatic{similar ? ` · ${rigLabel(similar.partition, summary?.sources)}` : ''}</option
								>{#each selectedProduct?.partitions ?? [] as partition (partition)}<option value={partition}
										>{rigLabel(partition, summary?.sources)}</option
									>{/each}</select
							></label
						>{/if}
					{#if referenceDetail}<label class="field-label"
							>Reference measurement<select
								class="text-input"
								value={urlState.measurement}
								onchange={(event) => {
									changeUrl({ m: event.currentTarget.value, chart: undefined });
								}}
								><option value="">Default product consensus</option
								>{#each referenceDetail.measurements.filter((m) => m.measurement.partition === (similar?.partition ?? (urlState.rig || selectedProduct?.partitions[0]))) as measurement (measurement.measurement.id)}<option
										value={measurement.measurement.id}
										>{measurement.source.name} · {measurement.measurement.variant.label}</option
									>{/each}</select
							></label
						>{/if}
				</div>{/if}
			{#if referenceError && urlState.mode === 'similar'}<Notice kind="caution">{referenceError}</Notice>{/if}
			{#if urlState.mode === 'profile'}<section class="profile" aria-label="Your taste profile">
					<h2>Your taste profile</h2>
					<p class="small muted">
						Saved in this browser, separately for IEMs and headphones. New products start as Love; adjust to
						your own experience.
					</p>
					<div class="profile-actions">
						<button type="button" onclick={exportProfile}>Export JSON</button><button
							type="button"
							onclick={() => importInput?.click()}>Import JSON</button
						><input
							class="sr-only"
							type="file"
							accept="application/json,.json"
							bind:this={importInput}
							onchange={(event) => {
								void importProfile(event);
							}}
							aria-label="Import profile file"
						/><button
							type="button"
							disabled={!items.length}
							onclick={() => {
								undo = profile;
								updateItems([]);
							}}>Clear profile</button
						>
					</div>
					{#if storageError}<Notice kind="caution">{storageError}</Notice>{/if}{#if profileError}<Notice
							kind="caution">{profileError}</Notice
						>{/if}
					{#if !items.length}<p class="profile-empty">
							No {form === 'iem' ? 'IEMs' : 'headphones'} in your profile yet. Add products you know, then rate
							them and optionally choose reasons.
						</p>{/if}
					<ProfileEditor {items} {products} onchange={updateItems} />
					{#if !hasPositive}<Notice
							>Add at least one sound-related Like or Love to infer a taste centre. Neutral and
							fit/comfort-only ratings do not inform measured sound.</Notice
						>{/if}
				</section>{/if}
			<div class="controls">
				{#if urlState.mode === 'similar'}<SegmentedControl
						label="Matching focus"
						options={[
							{ value: 'balanced', label: 'Balanced' },
							{ value: 'bass', label: 'Bass' },
							{ value: 'vocals', label: 'Vocals' },
							{ value: 'treble', label: 'Treble' }
						]}
						value={urlState.focus}
						onchange={(value: Focus) => {
							changeUrl({ focus: value === 'balanced' ? undefined : value }, true);
						}}
					/>{/if}
				<label class="budget field-label"
					>Maximum listed price (USD)<input
						class="text-input"
						type="number"
						min="0"
						step="1"
						placeholder="No limit"
						value={urlState.max ?? ''}
						onchange={(event) => {
							changeUrl(
								{
									max:
										event.currentTarget.value &&
										Number.isFinite(event.currentTarget.valueAsNumber) &&
										event.currentTarget.valueAsNumber >= 0
											? String(event.currentTarget.valueAsNumber)
											: undefined
								},
								true
							);
						}}
					/></label
				>
				<p class="small muted">With a budget, products without a published USD price are excluded.</p>
				<Toggle
					label="Include separate tunings"
					checked={urlState.tunings}
					onchange={(checked: boolean) => {
						changeUrl({ tunings: checked ? '1' : undefined }, true);
					}}
				/>
				<Disclosure label="Advanced matching">
					{#if urlState.mode === 'similar'}<Toggle
							label="Treble-sensitive matching"
							checked={urlState.alpha !== undefined}
							onchange={(checked: boolean) => {
								changeUrl({ alpha: checked ? '2' : undefined }, true);
							}}
						/>
						<p class="small muted">
							Penalises extra measured energy from 2–10 kHz; directional matching, not a hearing diagnosis.
						</p>
						{#if urlState.alpha !== undefined}<Slider
								label="Extra-treble penalty α"
								min={1}
								max={4}
								step={0.25}
								value={urlState.alpha}
								onchange={(value: number) => {
									changeUrl({ alpha: String(value) }, true);
								}}
							/>{/if}{/if}
					{#if urlState.mode === 'profile' && summary}<label class="field-label"
							>Taste measurement rig<select
								class="text-input"
								value={urlState.rig}
								onchange={(event) => {
									changeUrl({ rig: event.currentTarget.value, chart: undefined, sources: undefined });
								}}
								><option value=""
									>Automatic{taste ? ` · ${rigLabel(taste.partition, summary.sources)}` : ''}</option
								>{#each summary.partitions.filter((p) => p.form === form) as partition (partition.id)}<option
										value={partition.id}>{rigLabel(partition.id, summary.sources)}</option
									>{/each}</select
							></label
						>{/if}
					<fieldset class="source-filter">
						<legend class="field-label">Sources (none selected means all)</legend
						>{#each summary?.sources.filter((s) => s.form === form && (!activeResult || s.partition === activeResult.partition)) ?? [] as source (source.id)}<label
								><input
									type="checkbox"
									checked={urlState.sources.includes(source.id)}
									onchange={(event) => {
										changeUrl(
											{
												sources: (event.currentTarget.checked
													? [...urlState.sources, source.id]
													: urlState.sources.filter((s) => s !== source.id)
												).join(',')
											},
											true
										);
									}}
								/>{source.name}</label
							>{/each}
					</fieldset>
					{#if urlState.mode === 'profile' && taste}<p class="small muted">
							Corrections shift derived centres, not the learned statements or confidence. Units: dB.
						</p>
						{#each taste.model.tastes as target (target.id)}<fieldset class="corrections">
								<legend>Taste {target.id + 1} corrections</legend>{#each BANDS as band (band.id)}<Slider
										label={`Taste ${target.id + 1} ${bandLabels[band.id]}`}
										min={-4}
										max={4}
										step={0.5}
										unit="dB"
										value={currentCorrections[target.id]?.[band.id] ?? 0}
										onchange={(value: number) => {
											correct(target.id, band.id, value);
										}}
									/>{/each}
							</fieldset>{/each}{/if}
				</Disclosure>
			</div>
			<section class="results" id="discover-results" aria-label="Measured matches" aria-busy={loading}>
				<div class="section-heading">
					<h2>{urlState.mode === 'similar' ? 'Similar sound' : 'Taste matches'}</h2>
					<a class="chart-jump" href="#discover-chart">View chart</a><span class="eyebrow"
						>{activeResult ? rigLabel(activeResult.partition, summary?.sources) : 'Measured shape'}</span
					>
				</div>
				<p class="distance-note">
					Response distance (dB) · lower is closer, not better. Up to five chart overlays.
				</p>
				{#if activeResult?.harmonised}<p class="distance-note">
						Reviewer offsets corrected (<a href={resolve('/method#harmonisation')}>method</a>)
					</p>{/if}
				{#if loading}<Skeleton rows={4} />{:else if queryError}<Notice kind="caution">{queryError}</Notice
					>{:else}
					{#if taste && urlState.mode === 'profile'}<section class="model" aria-label="Taste model summary">
							<h3>Taste model summary</h3>
							{#each taste.model.tastes as target (target.id)}<h4>
									Taste {target.id + 1}: {target.members.map(nameFor).join(', ')}
								</h4>
								{#if target.summary.length}<ul>
										{#each target.summary as statement (statement.band)}<li>
												{describeTaste(statement, form)}
											</li>{/each}
									</ul>{:else}<p>
										{emptyTasteSummary(form)}
									</p>{/if}{/each}
							<p>
								<strong
									>{taste.model.confidence.level[0]?.toUpperCase()}{taste.model.confidence.level.slice(1)} support</strong
								>
							</p>
							<ul>
								{#each taste.model.confidence.reasons as reason (reason)}<li>
										{confidenceReason(reason)}
									</li>{/each}
							</ul>
							{#each taste.model.conflicts as conflict, index (`${conflict.liked}:${conflict.disliked}:${index}`)}<Notice
									kind="caution"
									>{nameFor(conflict.liked)} and {nameFor(conflict.disliked)}: {conflict.kind ===
									'near-liked-dislike'
										? 'a liked and disliked product have nearly the same measured shape'
										: `a liked product contradicts the dislike reason ${conflict.reason ? reasonLabels[conflict.reason] : ''}`}.</Notice
								>{/each}{#if taste.unusedItems.length}<h4>Not used in this sound model</h4>
								<ul>
									{#each taste.unusedItems as item (`${item.productId}:${item.measurementId}`)}<li>
											{nameFor(item.productId)}: {item.reason.replaceAll('-', ' ')}.
										</li>{/each}
								</ul>{/if}
						</section>{/if}
					{#if activeResult}<ol class="result-list">
							{#if urlState.mode === 'similar' && similar}{#each similar.results as match, index (match.candidate.id)}<ResultRow
										candidate={match.candidate}
										rank={index + 1}
										distance={match.distance}
										bands={match.bands}
										{match}
										referenceProductId={urlState.ref}
										selected={urlState.overlays.includes(match.candidate.id)}
										limitReached={selectedCount >= 5}
										onshow={() => {
											toggleOverlay(match.candidate.id);
										}}
									/>{/each}{:else if taste}{#each taste.results as row, index (row.candidate.id)}<ResultRow
										candidate={row.candidate}
										rank={index + 1}
										distance={row.fit.plainDistanceDb}
										bands={row.fit.bands}
										fit={row.fit}
										{nameFor}
										referenceProductId={items.find(
											(i) => (i.measurementId ?? i.productId) === row.fit.nearestLiked?.id
										)?.productId ?? ''}
										selected={urlState.overlays.includes(row.candidate.id)}
										limitReached={selectedCount >= 5}
										onshow={() => {
											toggleOverlay(row.candidate.id);
										}}
									/>{/each}{/if}
						</ol>
						{#if !activeResult.results.length}<Notice
								>No eligible matches on this rig with these filters. Try a wider budget or more sources.</Notice
							>{/if}<Disclosure label="Analysis caveats"
							>{#each activeResult.caveats as caveat (caveat)}<p class="small muted">
									{caveat}
								</p>{/each}</Disclosure
						>{:else if urlState.mode === 'similar'}<div class="empty-state">
							<h3>Choose {form === 'iem' ? 'an IEM' : 'a headphone'} to begin.</h3>
							<p>Measured matches and their differences will appear here.</p>
						</div>{/if}
				{/if}
			</section>
		</section>
		<aside class="chart-column" id="discover-chart" aria-label="Reference and match chart">
			<a class="chart-jump return-link" href="#discover-results">Back to matches</a>
			<FrChart
				{series}
				baselineId={urlState.mode === 'similar' ? 'reference' : `taste-${taste?.model.tastes[0]?.id ?? 0}`}
				emptyText={urlState.mode === 'profile'
					? 'No derived centre yet — add a sound-related Like or Love.'
					: `No curve yet — pick ${form === 'iem' ? 'an IEM' : 'a headphone'} to see its measured response.`}
			/>
			{#if chartLoading}<p role="status" class="chart-note">
					Loading display curves…
				</p>{/if}{#if chartError}<Notice kind="caution">Chart unavailable: {chartError}</Notice>{/if}
			{#if series.length}<p class="chart-note">
					Display curves are level-aligned to the first curve (weighted least squares on the full grid).
					Measured products use detail data; taste centres are derived, interpolated model curves, not
					measurements. Above 8 kHz is less reliable.
				</p>
				<details class="chart-sources">
					<summary>Curve sources</summary>
					<ul>
						{#each provenance as source (source.url)}<li>
								<a href={source.url} target="_blank" rel="external noreferrer">{source.label}</a>
							</li>{/each}
					</ul>
				</details>{/if}
		</aside>
	</div>
</div>
<Toast
	message={undo ? 'Profile changed. Previous profile is available to restore.' : ''}
	onundo={() => {
		if (undo) save(undo);
		undo = undefined;
	}}
	ondismiss={() => {
		undo = undefined;
	}}
/>

<style>
	.discover-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.08fr);
		align-items: start;
		gap: 64px;
	}
	.page-heading {
		margin-bottom: 32px;
	}
	.page-heading > p:not(.eyebrow) {
		max-width: 46ch;
	}
	.discovery-column {
		min-width: 0;
	}
	.chart-column {
		position: sticky;
		z-index: var(--z-sticky);
		top: 24px;
		min-width: 0;
	}
	.search {
		margin: 24px 0;
	}
	.search-note,
	.distance-note,
	.chart-note {
		color: var(--muted);
		font-size: var(--text-xs);
		margin-top: 12px;
	}
	.reference {
		border-top: var(--hairline) solid var(--line);
		padding: 20px 0;
		display: grid;
		gap: 12px;
	}
	.reference h2,
	.profile h2 {
		font-size: var(--text-lg);
	}
	.reference p {
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.controls {
		display: grid;
		gap: 16px;
		margin-top: 24px;
	}
	.budget input {
		margin-top: 8px;
		max-width: 200px;
		display: block;
	}
	select {
		width: 100%;
		margin-top: 8px;
	}
	.source-filter {
		border: 0;
		padding: 16px 0;
		margin: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		max-height: 260px;
		overflow-y: auto;
	}
	.source-filter label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--text-xs);
		min-height: 36px;
	}
	input[type='checkbox'] {
		accent-color: var(--accent);
	}
	.corrections {
		border: 0;
		padding: 16px 0;
		display: grid;
		gap: 12px;
	}
	.profile-actions {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
		margin: 12px 0;
	}
	.profile-actions button {
		background: none;
		border: 0;
		padding: 8px 0;
		color: var(--accent);
		text-decoration: underline;
		font-size: var(--text-xs);
		cursor: pointer;
	}
	.profile-actions button:disabled {
		color: var(--muted);
		cursor: not-allowed;
	}
	.profile-empty {
		padding: 24px 0;
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.results {
		margin-top: 32px;
		min-height: 640px;
	}
	.results :global(.loading-row) {
		height: 160px;
	}
	.chart-jump {
		display: none;
		align-items: center;
		min-block-size: 28px;
		font-size: var(--text-xs);
	}
	.section-heading {
		margin-bottom: 8px;
	}
	.section-heading .eyebrow {
		font-size: 9px;
		letter-spacing: 0.03em;
		text-transform: none;
	}
	.distance-note {
		margin-bottom: 20px;
	}
	.result-list {
		padding: 0;
		margin: 0;
	}
	.model {
		border-top: var(--hairline) solid var(--line);
		padding: 20px 0;
		font-size: var(--text-xs);
	}
	.model h3 {
		font-size: var(--text-base);
		margin-bottom: 16px;
	}
	.model h4 {
		font-size: var(--text-sm);
		margin: 16px 0 8px;
	}
	.model ul {
		padding-left: 20px;
		margin: 8px 0 16px;
	}
	.model li {
		margin-bottom: 6px;
	}
	.chart-sources {
		font-size: var(--text-xs);
		margin-top: 12px;
	}
	.chart-sources summary {
		min-height: 36px;
		padding: 8px 0;
		cursor: pointer;
	}
	.chart-sources ul {
		padding-left: 20px;
	}
	.chart-sources a {
		display: inline-flex;
		align-items: center;
		min-block-size: 28px;
		min-inline-size: 24px;
	}
	@media (max-width: 1150px) {
		.discover-grid {
			gap: 32px;
		}
	}
	@media (max-width: 900px) {
		.discover-grid {
			grid-template-columns: 1fr;
			gap: 40px;
		}
		.chart-column {
			position: static;
		}
		.chart-jump {
			display: inline-flex;
		}
		.return-link {
			margin-bottom: 16px;
		}
	}
	@media (max-width: 640px) {
		.discovery-column :global(.segmented) {
			display: flex;
			width: 100%;
		}
		.discovery-column :global(.segmented label) {
			flex: 1;
		}
		.discovery-column :global(.segmented span) {
			padding: 8px;
			font-size: 12px;
			text-align: center;
			height: 100%;
			justify-content: center;
		}
	}
</style>
