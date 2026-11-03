<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { browser } from '$app/env';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { Focus } from '#core/analysis/weights.ts';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { PathnameWithSearchOrHash } from '$app/types';
	import { analysis, productList } from '#lib/atlas.ts';
	import type { Form } from '#core/dataset/types.ts';
	import type { AtlasError, AtlasSummary, ProductListItem, SourceMode } from '#core/atlas/types.ts';
	import { BANDS, type Band } from '#core/analysis/common.ts';
	import { productSearch } from '#lib/product-search.ts';
	import {
		emptyProfile,
		soundItems,
		parseProfile,
		PROFILE_LIMIT,
		type Profile,
		type WorkspaceItem
	} from '#lib/profile/profile.ts';
	import { profileStore } from '#lib/profile/store.ts';
	import { parseDiscovery, withItems, withDiscoveryChanges, discoveryRoute } from './state.ts';
	import { latestQuery, queryDiscovery, type DiscoveryResult, type QuerySpec } from './query.ts';
	import { rigLabel } from '#lib/rigs.ts';
	import { sourceInForm, sourceOnPartition } from '#lib/sources.ts';
	import { catalogIdentity, migrationCatalogs, productFor } from '#lib/product/data.ts';
	import type { CatalogIdentity } from '#lib/catalog/identity.ts';
	import { canonicalItem, migrateProfile, migrateUrl } from '#lib/catalog/migrate.ts';
	import { migrationMessages } from '#lib/catalog/notice.ts';
	import {
		handoffMigration,
		recallMigration,
		rememberMigration,
		takeMigration
	} from '#lib/catalog/handoff.ts';
	import MigrationNote from '#lib/catalog/MigrationNote.svelte';
	import { bandLabels } from './describe.ts';
	import SearchCombobox from '#lib/components/SearchCombobox.svelte';
	import SegmentedControl from '#lib/components/SegmentedControl.svelte';
	import Toggle from '#lib/components/Toggle.svelte';
	import Slider from '#lib/components/Slider.svelte';
	import Notice from '#lib/components/Notice.svelte';
	import Skeleton from '#lib/components/Skeleton.svelte';
	import Toast from '#lib/components/Toast.svelte';
	import ProfileEditor from '#lib/profile/ProfileEditor.svelte';
	import SourceFilter from './SourceFilter.svelte';
	import ChartPanel from './ChartPanel.svelte';
	import TasteSummary from './TasteSummary.svelte';
	import ResultRow from './ResultRow.svelte';
	import ReferenceDiagnostics from './ReferenceDiagnostics.svelte';
	import { compareEvidence, nearestLikedEvidence } from './evidence.ts';

	let { form }: { form: Form } = $props();
	let settings = $derived(parseDiscovery(browser ? page.url.searchParams : new SvelteURLSearchParams()));
	let products = $state.raw<ProductListItem[]>([]);
	let summary = $state.raw<AtlasSummary>();
	let identity = $state.raw<CatalogIdentity>();
	let migrationNote = $state<string[]>([]);
	let migrationBefore = $state.raw<{ profile: Profile; url: string }>();
	let migrationDisplay = $derived(
		migrationNote.length || !migrationBefore
			? migrationNote
			: ['A catalog update changed your ratings. Undo restores the pre-migration profile for this session.']
	);
	let migrationUndone = false;
	function keepMigration(before: { profile: Profile; url: string } | undefined) {
		migrationBefore = before;
		rememberMigration(() => sessionStorage, before);
	}
	let locationVersion = 0;
	let catalogLoading = $state(true);
	let identityReady = $state(false);
	let migratedHref = $state('');
	let catalogError = $state('');
	let ready = $state(false);
	let query = $state('');
	let profile = $state.raw<Profile>(emptyProfile());
	let store: ReturnType<typeof profileStore> | undefined;
	let storageError = $state('');
	let profileError = $state('');
	let undoMessage = $state('');
	let importInput: HTMLInputElement;
	let result = $state.raw<DiscoveryResult>();
	let resultItems = $state.raw<WorkspaceItem[]>([]);
	let resultSort = $state<'mean' | 'minimax'>('mean');
	let similarReferenceId = $derived(
		result?.kind === 'similar' ? (result.data.reference.productId ?? '') : ''
	);
	let queryError = $state.raw<AtlasError>();
	let networkError = $state('');
	let loading = $state(false);
	let topK = $derived(settings.depth);
	let upload = $state.raw<{ id: string; name: string; rig: string; values: Float64Array }>();
	let uploadRig = $state('');
	let uploadError = $state('');
	let uploadLoading = $state(false);
	let uploadGeneration = 0;
	let items = $derived(settings.items ?? profile.profiles[form]);
	let starting = $derived(!items.length && !upload);
	let route = $derived(upload ? 'similar' : discoveryRoute(items, settings.view));
	let displayRoute = $derived(result?.kind ?? route);
	let search = $derived(productSearch(products));
	let choices = $derived(
		search(query)
			.filter(
				(p) =>
					!items.some(
						(item) => (identity ? canonicalItem(item, identity).productId : item.productId) === p.id
					)
			)
			.map((p) => ({
				...p,
				label: `${p.brand} ${p.model}`,
				group: p.brand,
				variants: p.variantLabels.length,
				sources: p.sourceCount
			}))
	);
	let examples = $derived(
		[...products]
			.filter((p) =>
				p.defaultPartitions.includes(
					settings.rig ||
						(summary?.partitions
							.filter((p) => p.form === form)
							.sort((a, b) => b.productCount - a.productCount || a.id.localeCompare(b.id))[0]?.id ??
							'')
				)
			)
			.sort(
				(a, b) =>
					b.sourceCount - a.sourceCount || b.measurementCount - a.measurementCount || a.id.localeCompare(b.id)
			)
			.slice(0, 3)
	);
	let activePartition = $derived(upload?.rig || settings.rig || result?.data.partition || '');
	let overlays = $derived(
		settings.overlays.filter((id) => result?.data.results.some((row) => row.candidate.id === id))
	);
	let referenceNames = $derived(
		result?.kind === 'compare'
			? result.data.references.map((reference) => nameFor(reference.productId ?? ''))
			: []
	);
	let compareReferences = $derived(
		resultItems
			.filter((i) => i.soundRelated && ['like', 'love'].includes(i.rating))
			.map(({ productId, measurementId }) => ({ productId, ...(measurementId ? { measurementId } : {}) }))
	);
	let modelKey = $derived(
		JSON.stringify({
			form,
			rig: settings.rig,
			sources: settings.sources,
			sourceMode: settings.sourceMode,
			items
		})
	);
	let scopedEdits = $state<Record<string, NonNullable<QuerySpec['state']['corrections']>>>({});
	let corrections = $derived(scopedEdits[modelKey] ?? settings.corrections);
	let queryKey = $derived(
		JSON.stringify({
			state: { ...settings, overlays: [], corrections },
			items,
			topK,
			...(upload ? { upload: { id: upload.id, rig: upload.rig } } : {})
		} satisfies QuerySpec)
	);
	const controller = latestQuery<Awaited<ReturnType<typeof queryDiscovery>>>();
	const errorText = (cause: unknown) =>
		cause instanceof Error ? cause.message : 'Analysis unavailable. Please try again.';
	function nameFor(id: string): string {
		const resolved = result?.data.resolvedIds?.find(
			(entry) => entry.productId === id || entry.measurementId === id
		);
		const product = productFor(
			products,
			resolved?.canonicalProductId ??
				identity?.measurementProduct(id) ??
				[...resultItems, ...items].find((item) => item.measurementId === id)?.productId ??
				id,
			identity
		);
		return product ? `${product.brand} ${product.model}` : 'Unavailable product';
	}
	async function migrateLocation(href: string, current: CatalogIdentity, other?: CatalogIdentity) {
		if (migrationUndone) return false;
		const migrated = migrateUrl(new URL(href), current, other);
		const fresh = migrationMessages(migrated.messages);
		if (fresh.length) migrationNote = [...migrationNote, ...fresh];
		if (migrated.droppedRating && !migrationBefore) keepMigration({ profile, url: href });
		if (migrated.changed) {
			if ((migrated.url.searchParams.get('form') === 'headphones' ? 'headphone' : 'iem') !== form)
				handoffMigration({ target: migrated.url.href, messages: migrationNote, before: migrationBefore });
			await goto(
				resolve(
					`${migrated.url.pathname}${migrated.url.search}${migrated.url.hash}` as PathnameWithSearchOrHash
				),
				{ state: page.state, replace: true, reset: false }
			);
		}
		return migrated.changed;
	}
	function undoMigration() {
		if (!migrationBefore || !store) return;
		migrationUndone = true;
		store.restoreSession(migrationBefore.profile);
		profile = store.value;
		storageError = store.error;
		const restored = new URL(migrationBefore.url, page.url.href);
		if ((restored.searchParams.get('form') === 'headphones' ? 'headphone' : 'iem') !== form)
			handoffMigration({ target: restored.href, messages: [], restored: profile, undone: true });
		void goto(resolve(`${restored.pathname}${restored.search}${restored.hash}` as PathnameWithSearchOrHash), {
			state: page.state,
			replace: true,
			reset: false
		});
		keepMigration(undefined);
		migrationNote = [];
		undoMessage = 'Pre-migration profile restored for this session.';
	}
	function navigate(params: URLSearchParams, replace = true) {
		locationVersion++;
		void goto(resolve(`/?${params}` as PathnameWithSearchOrHash), { reset: false, replace });
	}
	function change(changes: Record<string, string | undefined>) {
		const resetDepth = Object.keys(changes).some((key) => !['chart', 'edits', 'depth'].includes(key));
		navigate(
			withDiscoveryChanges(page.url.searchParams, { ...(resetDepth ? { depth: undefined } : {}), ...changes })
		);
	}
	function updateItems(next: WorkspaceItem[], message = 'Workspace updated.') {
		if (!store) return;
		const before = { ...profile, profiles: { ...profile.profiles, [form]: items } };
		store.change({ ...profile, profiles: { ...profile.profiles, [form]: next } }, before);
		profile = store.value;
		storageError = store.error;
		undoMessage = message;
		navigate(withItems(page.url.searchParams, next));
	}
	function choose(product: ProductListItem) {
		if (items.length >= PROFILE_LIMIT) {
			profileError = `A profile supports at most ${PROFILE_LIMIT} products per form factor. Remove one before adding another.`;
			return;
		}
		profileError = '';
		upload = undefined;
		updateItems(
			[...items, { productId: product.id, rating: 'unrated', strength: 0, soundRelated: true }],
			'Product added. Choose a rating to use it for matching.'
		);
		query = '';
	}
	function rate(item: WorkspaceItem) {
		if (!items.some((i) => i.productId === item.productId) && items.length >= PROFILE_LIMIT) {
			profileError = `A profile supports at most ${PROFILE_LIMIT} products per form factor. Remove one before adding another.`;
			return;
		}
		updateItems([...items.filter((i) => i.productId !== item.productId), item], 'Rating saved.');
	}
	function toggleOverlay(id: string) {
		change({
			chart: (overlays.includes(id) ? overlays.filter((x) => x !== id) : [...overlays, id].slice(0, 5)).join(
				','
			)
		});
	}
	function correct(tasteId: number, band: Band, value: number) {
		const next = corrections.filter((edit) => edit.tasteId !== tasteId);
		next.push({
			tasteId,
			bands: { ...corrections.find((edit) => edit.tasteId === tasteId)?.bands, [band]: value }
		});
		scopedEdits = { ...scopedEdits, [modelKey]: next };
		change({ edits: JSON.stringify(next) });
	}
	function exportProfile() {
		const url = URL.createObjectURL(
			new Blob([JSON.stringify({ ...profile, profiles: { ...profile.profiles, [form]: items } }, null, 2)], {
				type: 'application/json'
			})
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
		if (!file || !store) return;
		try {
			if (file.size > 1_000_000) throw new Error('Profile file is too large (maximum 1 MB).');
			const parsed = parseProfile(await file.text());
			const info = summary ?? (await (await analysis()).summary());
			const catalogs = {
				iem: await catalogIdentity('iem', info.version),
				headphone: await catalogIdentity('headphone', info.version)
			};
			const migrated = migrateProfile(parsed, catalogs);
			const next = migrated.profile;
			migrationNote = [...migrationNote, ...migrationMessages(migrated.messages)];
			if (migrated.droppedRating && !migrationBefore)
				keepMigration({
					profile: parsed,
					url: `/?${withItems(page.url.searchParams, parsed.profiles[form])}`
				});
			// Ordinary Undo restores the visible workspace, which may come from a shared URL.
			store.change(next, { ...profile, profiles: { ...profile.profiles, [form]: items } });
			profile = store.value;
			storageError = store.error;
			undoMessage = 'Profile imported.';
			navigate(withItems(page.url.searchParams, next.profiles[form]));
			profileError = '';
		} catch (cause) {
			profileError = `Import failed: ${errorText(cause)}`;
		}
		input.value = '';
	}
	async function addUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !uploadRig) return;
		const rig = uploadRig;
		const generation = ++uploadGeneration;
		const href = page.url.href;
		const current = () => generation === uploadGeneration && page.url.href === href;
		uploadLoading = true;
		uploadError = '';
		try {
			if (file.size > 5_000_000) throw new Error('Measurement file is too large (maximum 5 MB).');
			const text = await file.text();
			if (!current()) return;
			const service = await analysis();
			if (!current()) return;
			const parsed = await service.parseUpload(text, file.name);
			if (!current()) return;
			if (!parsed.ok) throw new Error(parsed.error);
			upload = { id: parsed.uploadId, name: file.name, rig, values: parsed.values };
			change({ chart: undefined, sources: undefined });
		} catch (cause) {
			if (current()) uploadError = errorText(cause);
		} finally {
			if (generation === uploadGeneration) {
				uploadLoading = false;
				input.value = '';
			}
		}
	}
	onMount(() => {
		store = profileStore(
			{
				getItem: (key) => localStorage.getItem(key),
				setItem: (key, value) => {
					localStorage.setItem(key, value);
				}
			},
			{
				getItem: (key) => sessionStorage.getItem(key),
				setItem: (key, value) => {
					sessionStorage.setItem(key, value);
				}
			}
		);
		const pending = takeMigration(page.url.href);
		if (pending?.restored) store.restoreSession(pending.restored);
		migrationUndone = store.restoredSession || (pending?.undone ?? false);
		keepMigration(pending?.before ?? (migrationUndone ? undefined : recallMigration(() => sessionStorage)));
		migrationNote = pending?.messages ?? [];
		profile = store.value;
		storageError = store.error;
		ready = true;
		const startup = new AbortController();
		// A function, so narrowing after one check doesn't hide a later abort across awaits.
		const cancelled = () => startup.signal.aborted;
		void Promise.all([productList(form), analysis().then((service) => service.summary())])
			.then(async ([list, info]) => {
				if (cancelled()) return;
				products = list;
				summary = info;
				catalogLoading = false;
				const catalogs = await migrationCatalogs(form, info.version, new URL(page.url.href), profile);
				if (!cancelled()) {
					const before = profile;
					const migrated = migrateProfile(profile, migrationUndone ? {} : catalogs);
					migrationNote = [...migrationNote, ...migrationMessages(migrated.messages)];
					if (migrated.droppedRating && !migrationBefore)
						keepMigration({ profile: before, url: page.url.href });
					if (migrated.changed && store) {
						store.change(migrated.profile);
						profile = store.value;
						storageError = store.error;
					}
					identity = catalogs[form];
					identityReady = true;
				}
			})
			.catch((cause: unknown) => {
				if (!cancelled()) {
					catalogError = errorText(cause);
					catalogLoading = false;
				}
			});
		return () => {
			uploadGeneration++;
			startup.abort();
			controller.invalidate();
		};
	});
	$effect(() => {
		const href = page.url.href,
			current = identity,
			version = summary?.version;
		if (catalogLoading || !identityReady || !version) return;
		migratedHref = '';
		const abort = new AbortController();
		const cancelled = () => abort.signal.aborted;
		untrack(() => {
			const revision = locationVersion;
			void (current ? migrationCatalogs(form, version, new URL(href)) : Promise.resolve({})).then(
				async (catalogs: Partial<Record<Form, CatalogIdentity>>) => {
					if (abort.signal.aborted || revision !== locationVersion) return;
					const changed =
						current && (await migrateLocation(href, current, catalogs[form === 'iem' ? 'headphone' : 'iem']));
					if (!changed && !cancelled() && revision === locationVersion) migratedHref = href;
				}
			);
		});
		return () => {
			abort.abort();
		};
	});
	$effect(() => {
		const cached = scopedEdits[modelKey];
		if (cached && JSON.stringify(cached) !== JSON.stringify(settings.corrections))
			untrack(() => {
				change({ edits: JSON.stringify(cached) });
			});
	});
	$effect(() => {
		if (!ready || catalogLoading || catalogError || migratedHref !== page.url.href) return;
		const spec = JSON.parse(queryKey) as QuerySpec;
		const currentIdentity = identity;
		controller.invalidate();
		queryError = undefined;
		networkError = '';
		if (
			!spec.upload &&
			currentIdentity &&
			soundItems(spec.items).some(
				(item) => !products.some((p) => p.id === canonicalItem(item, currentIdentity).productId)
			)
		) {
			result = undefined;
			loading = false;
			networkError = 'A rated reference is not in this form-factor catalog. Remove it or switch form factor.';
			return;
		}
		if (!spec.upload && discoveryRoute(spec.items, spec.state.view) === 'empty') {
			result = undefined;
			loading = false;
			return;
		}
		loading = true;
		const timer = window.setTimeout(() => {
			void controller.run(
				async () => queryDiscovery(await analysis(), spec),
				(next) => {
					if (next && 'ok' in next) {
						queryError = next;
						result = undefined;
					} else {
						result = next ?? undefined;
						resultItems = spec.items;
						resultSort = spec.state.sort;
					}
					loading = false;
				},
				(cause) => {
					networkError = errorText(cause);
					loading = false;
					result = undefined;
				}
			);
		}, 150);
		return () => {
			clearTimeout(timer);
			controller.invalidate();
		};
	});
</script>

<div class={['page discover', { starting }]}>
	<div class="page-heading">
		<h1>
			{starting
				? `Find ${form === 'iem' ? 'IEMs' : 'headphones'} with a familiar measured shape.`
				: 'Discover your next comparison.'}
		</h1>
		<p>Add products you know, then rate your experience. Start with one Like or build a set of references.</p>
	</div>
	<MigrationNote
		messages={migrationDisplay}
		onundo={migrationBefore ? undoMigration : undefined}
		ondismiss={() => {
			migrationNote = [];
			keepMigration(undefined);
		}}
	/>
	<div class="discover-grid">
		<section class="discovery-column" aria-label="Your references and preferences">
			<div class="search">
				<SearchCombobox
					items={choices}
					label={`Add ${form === 'iem' ? 'an IEM' : 'a headphone'}`}
					placeholder="Search by brand or model"
					bind:query
					loading={catalogLoading}
					filter={false}
					shortcut
					onselect={choose}
				/>
			</div>
			{#if catalogError}<Notice kind="caution">Catalog unavailable: {catalogError}</Notice>{/if}
			{#if settings.issue}<Notice kind="caution">{settings.issue}</Notice>{/if}
			{#if storageError}<Notice kind="caution">{storageError}</Notice>{/if}
			{#if profileError}<Notice kind="caution">{profileError}</Notice>{/if}
			{#if starting}<div class="start-guide">
					<h2>Start with a pair you know.</h2>
					<p>Nothing is selected for you. Products stay inactive until you choose a rating.</p>
					<ol>
						<li>Add a product and choose Like or Love</li>
						<li>Read the measured differences</li>
						<li>Add more references to explore trade-offs</li>
					</ol>
					<a href={resolve(`/explore${form === 'headphone' ? '?form=headphones' : ''}`)}
						>Browse the catalog <span aria-hidden="true">↗</span></a
					>
				</div>{/if}
			{#if items.length}<div class="workspace-heading">
					<h2>Your references</h2>
					<button
						type="button"
						onclick={() => {
							updateItems([], 'References cleared.');
						}}>Clear all</button
					>
				</div>
				<ProfileEditor
					{items}
					{products}
					{identity}
					partition={activePartition}
					onchange={updateItems}
				/>{/if}
			{#if !starting && route === 'empty'}<Notice
					>Choose at least one sound-related Like or Love to see matches. Not rated, Neutral and
					fit/comfort-only items do not define a sound reference.</Notice
				>{/if}
			{#if upload}<Notice title={`Local reference: ${upload.name}`}
					>Your saved ratings are inactive while using this upload. <button
						type="button"
						onclick={() => {
							upload = undefined;
						}}>Remove local reference</button
					></Notice
				>{/if}
			{#if route === 'compare' || (route === 'taste' && items.filter((i) => i.soundRelated && ['like', 'love'].includes(i.rating)).length >= 2 && items.filter((i) => i.soundRelated && i.rating !== 'unrated' && i.rating !== 'neutral').length <= 4 && !items.some((i) => i.soundRelated && i.rating === 'dislike'))}<SegmentedControl
					label="Recommendation view"
					options={[
						{ value: 'auto', label: 'Reference trade-offs' },
						{ value: 'taste', label: 'Taste-model view' }
					]}
					value={settings.view}
					onchange={(value) => {
						change({ mode: undefined, view: value === 'taste' ? 'taste' : undefined });
					}}
				/>{/if}
			<details class="refine">
				<summary>Refine matches <span>Rig, budget &amp; reviewers</span></summary>
				<div class="controls">
					<label class="field-label"
						>Measurement rig<select
							value={upload?.rig ?? settings.rig}
							disabled={Boolean(upload)}
							onchange={(event) => {
								change({
									rig: event.currentTarget.value,
									sources: undefined,
									chart: undefined,
									edits: undefined
								});
							}}
							><option value=""
								>Automatic{result ? ` · ${rigLabel(result.data.partition, summary?.sources)}` : ''}</option
							>{#each summary?.partitions.filter((p) => p.form === form) ?? [] as partition (partition.id)}<option
									value={partition.id}>{rigLabel(partition.id, summary?.sources)}</option
								>{/each}</select
						></label
					>
					{#if upload}<p class="small muted">
							Rig is locked to your upload: {rigLabel(upload.rig, summary?.sources)}. Remove the local
							reference to change rigs.
						</p>{/if}
					{#if route !== 'taste'}<SegmentedControl
							label="Matching focus"
							options={[
								{ value: 'balanced', label: 'Balanced' },
								{ value: 'bass', label: 'Bass' },
								{ value: 'vocals', label: 'Vocals' },
								{ value: 'treble', label: 'Treble' }
							]}
							value={settings.focus}
							onchange={(value: Focus) => {
								change({ focus: value === 'balanced' ? undefined : value });
							}}
						/>{/if}
					<label class="field-label budget"
						>Maximum reviewer-listed price (USD)<input
							class="text-input"
							type="number"
							min="0"
							step="1"
							placeholder="No limit"
							value={settings.max ?? ''}
							onchange={(event) => {
								change({
									max:
										event.currentTarget.value &&
										Number.isFinite(event.currentTarget.valueAsNumber) &&
										event.currentTarget.valueAsNumber >= 0
											? String(event.currentTarget.valueAsNumber)
											: undefined
								});
							}}
						/></label
					>
					<p class="small muted">
						Listed prices are historical reviewer entries, not current deals. A budget excludes products
						without a USD price.
					</p>
					<Toggle
						label="Include separate tunings"
						checked={settings.tunings}
						onchange={(checked) => {
							change({ tunings: checked ? '1' : undefined });
						}}
					/>
					{#if route !== 'taste'}<Toggle
							label="Treble-sensitive matching"
							checked={settings.alpha !== undefined}
							onchange={(checked) => {
								change({ alpha: checked ? '2' : undefined });
							}}
						/>
						<p class="small muted">Adds a directional penalty for extra energy from 2–10 kHz.</p>
						{#if settings.alpha !== undefined}<Slider
								label="Extra-treble penalty α"
								min={1}
								max={4}
								step={0.25}
								value={settings.alpha}
								onchange={(value) => {
									change({ alpha: String(value) });
								}}
							/>{/if}{/if}
					<SourceFilter
						sources={summary?.sources.filter(
							(s) => sourceInForm(s, form) && (!activePartition || sourceOnPartition(s, activePartition))
						) ?? []}
						partition={activePartition}
						partitions={summary?.partitions.filter((p) => p.form === form).map((p) => p.id) ?? []}
						selected={settings.sources}
						mode={settings.sourceMode}
						onmodechange={(mode: SourceMode) => {
							change({ sourceMode: mode === 'only' ? 'only' : undefined });
						}}
						onchange={(ids: string[]) => {
							change({ sources: ids.join(',') });
						}}
					/>
					{#if result?.kind === 'taste'}<details>
							<summary>Adjust derived taste centres</summary>
							<p class="small muted">
								Corrections shift centres in dB, not learned statements or confidence.
							</p>
							{#each result.data.model.tastes as target (target.id)}<fieldset class="corrections">
									<legend>Taste {target.id + 1} corrections</legend>{#each BANDS as band (band.id)}<Slider
											label={`Taste ${target.id + 1} ${bandLabels[band.id]}`}
											min={-4}
											max={4}
											step={0.5}
											unit="dB"
											value={corrections.find((edit) => edit.tasteId === target.id)?.bands[band.id] ?? 0}
											onchange={(value: number) => {
												correct(target.id, band.id, value);
											}}
										/>{/each}
								</fieldset>{/each}
						</details>{/if}
				</div>
			</details>
			<details class="workspace-tools">
				<summary>Profile files &amp; local measurement</summary>
				<div class="profile-actions">
					<button type="button" onclick={exportProfile}>Export profile JSON</button><button
						type="button"
						onclick={() => {
							importInput.click();
						}}>Import profile JSON</button
					><input
						class="sr-only"
						type="file"
						accept="application/json,.json"
						bind:this={importInput}
						onchange={(event) => void importProfile(event)}
						aria-label="Import profile file"
					/>
				</div>
				<p class="small muted">
					Ratings are saved in this browser, separately for IEMs and headphones, and included in shared
					workspace URLs.
				</p>
				<h3>Use your own measurement</h3>
				<p class="small muted">
					Choose the measurement rig before adding a file. The file stays in this browser session: never
					uploaded, saved in your profile or included in a URL.
				</p>
				<label class="field-label"
					>Upload measurement rig<select bind:value={uploadRig}
						><option value="">Choose the rig used to measure this file</option
						>{#each summary?.partitions.filter((p) => p.form === form) ?? [] as partition (partition.id)}<option
								value={partition.id}>{rigLabel(partition.id, summary?.sources)}</option
							>{/each}</select
					></label
				><label class="field-label"
					>Local reference measurement<input
						type="file"
						accept=".txt,.csv,.frd"
						disabled={!uploadRig || uploadLoading}
						onchange={(event) => void addUpload(event)}
					/></label
				>{#if uploadError}<Notice kind="caution">{uploadError}</Notice>{/if}{#if uploadLoading}<p
						role="status"
					>
						Reading local measurement…
					</p>{/if}
			</details>
		</section>
		{#if starting}<aside class="starting-examples" aria-label="Example references">
				<div class="examples-heading">
					<h2>Widely measured starting points</h2>
					<p>From the active catalog and rig. Add one, then choose your own rating.</p>
				</div>
				{#if catalogLoading}<p role="status">
						Loading catalog…
					</p>{/if}{#each examples as product, index (product.id)}<button
						class="example"
						type="button"
						onclick={() => {
							choose(product);
						}}
						><span class="example-index">{String(index + 1).padStart(2, '0')}</span><span class="example-name"
							><span class="example-brand">{product.brand}</span><strong>{product.model}</strong><span
								class="example-sources">{product.sourceCount} measured sources</span
							></span
						><span class="example-arrow" aria-hidden="true">+</span></button
					>{/each}
				<p class="example-note">Examples are ordered by measurement coverage, not sound quality.</p>
			</aside>
		{:else}
			<aside class="chart-column" id="discover-chart" aria-label="Reference and match chart">
				<a class="chart-jump" href="#discover-results">Go to matches</a>{#if result}<ChartPanel
						{result}
						{overlays}
						{nameFor}
						localReference={upload
							? {
									id: upload.id,
									label: 'Your local measurement',
									values: upload.values,
									attribution: `${upload.rig} · local measurement · uncorrected, unsmoothed`
								}
							: undefined}
					/>{:else}<div class="empty-state">
						<h2>
							{#if queryError?.error === 'not-measured-on-rig'}
								{queryError.partitions?.length
									? 'This rig doesn’t cover every reference. Choose a rig below.'
									: 'No rig covers every reference. Change a reference or variant.'}
							{:else if queryError?.error === 'partition-required'}
								Choose a rig below to draw your references.
							{:else if queryError || networkError || catalogError}
								Chart unavailable. Check the matching message below.
							{:else if loading}
								Drawing your reference chart…
							{:else}
								Choose a rating to draw your reference.
							{/if}
						</h2>
						<p>The chart will use the exact smoothed, level-aligned values used for ranking.</p>
					</div>{/if}
			</aside>
			<section class="results" id="discover-results" aria-label="Measured matches" aria-busy={loading}>
				<div class="section-heading">
					<h2>
						{displayRoute === 'compare'
							? 'Reference trade-offs'
							: displayRoute === 'taste'
								? 'Taste matches'
								: 'Measured matches'}
					</h2>
					<a class="chart-jump" href="#discover-chart">View chart</a>
				</div>
				<p class="distance-note">
					{result ? `${rigLabel(result.data.partition, summary?.sources)} · ` : ''}{displayRoute === 'taste'
						? 'Taste ranking score · lower is closer; includes dislike penalties, not a dB distance. Each row also shows ordinary response distance in dB.'
						: 'Response distance in dB · lower is closer, not better.'}
				</p>
				{#if loading}<p role="status" class="updating">
						{result ? 'Updating matches… previous results shown below.' : 'Finding measured matches…'}
					</p>
					{#if !result}<Skeleton rows={4} />{/if}{/if}
				{#if queryError}<Notice kind="caution" title="References do not overlap on this rig"
						><ReferenceDiagnostics
							{items}
							{form}
							version={summary?.version ?? ''}
							{identity}
							{products}
							partition={activePartition}
							sources={summary?.sources ?? []}
							selected={settings.sources}
							mode={settings.sourceMode}
						/>{#if queryError.partitions?.length}<div class="compatible-rigs">
								<span>All references, including selected variants, are measured on:</span>
								{#each queryError.partitions as partition (partition)}<button
										type="button"
										onclick={() => {
											change({ rig: partition, sources: undefined, chart: undefined });
										}}>Use {rigLabel(partition, summary?.sources)}</button
									>{/each}
							</div>{:else}<p>
								Choose a compatible rig or remove a reference; no variant or rig is substituted.
							</p>{/if}</Notice
					>{/if}
				{#if networkError}<Notice kind="caution">{networkError}</Notice>{/if}
				{#if result?.kind === 'compare'}<div class="tradeoff-controls">
						<label class="field-label"
							>Trade-off sort<select
								value={settings.sort}
								onchange={(event) => {
									change({ sort: event.currentTarget.value === 'mean' ? undefined : 'minimax' });
								}}
								><option value="mean">Closest overall (mean)</option><option value="minimax"
									>Balanced compromise (minimax)</option
								></select
							></label
						><Toggle
							label={`Best trade-offs only (${result.data.counts.pareto} of ${result.data.counts.candidates})`}
							checked={settings.pareto}
							onchange={(checked) => {
								change({ pareto: checked ? '1' : undefined });
							}}
						/>
					</div>
					<p class="small muted">
						The chart labels which reference each candidate is aligned to; each distance column independently
						level-aligns to its own reference.
					</p>{/if}
				{#if result?.kind === 'taste'}<TasteSummary taste={result.data} {form} {nameFor} />{/if}
				{#if result}<p class="distance-note">
						{result.data.sourceMode === 'only'
							? 'Scored using selected reviewers’ measurements only.'
							: 'Reviewer coverage filter · scored using all eligible sources.'}
					</p>
					{#if settings.sources.length && result.data.caveats.length}<aside
							class="source-caveats"
							aria-label="Reviewer selection caveats"
						>
							{#each result.data.caveats as caveat (caveat)}<p>{caveat}</p>{/each}
						</aside>{/if}{/if}
				{#if result}<ol class="result-list">
						{#if result.kind === 'similar'}{#each result.data.results as match, index (match.candidate.id)}<ResultRow
									candidate={match.candidate}
									existing={items.find((item) => item.productId === match.candidate.product.id)}
									rank={index + 1}
									distance={match.distance}
									bands={match.bands}
									{match}
									referenceProductId={similarReferenceId}
									selected={overlays.includes(match.candidate.id)}
									limitReached={overlays.length >= 5}
									onshow={() => {
										toggleOverlay(match.candidate.id);
									}}
									onrate={rate}
								/>{/each}
						{:else if result.kind === 'taste'}{#each result.data.results as row, index (row.candidate.id)}<ResultRow
									candidate={row.candidate}
									existing={items.find((item) => item.productId === row.candidate.product.id)}
									rank={index + 1}
									distance={row.fit.plainDistanceDb}
									bands={row.fit.bands}
									fit={row.fit}
									nearestLiked={nearestLikedEvidence(result.data, row)}
									{nameFor}
									referenceProductId={resultItems.find(
										(i) => (i.measurementId ?? i.productId) === row.nearestLiked?.id
									)?.productId ?? ''}
									selected={overlays.includes(row.candidate.id)}
									limitReached={overlays.length >= 5}
									onshow={() => {
										toggleOverlay(row.candidate.id);
									}}
									onrate={rate}
								/>{/each}
						{:else}{#each result.data.results as row, index (row.candidate.id)}{@const evidence =
									compareEvidence(result.data, row.rankCurve, referenceNames)}<ResultRow
									candidate={row.candidate}
									existing={items.find((item) => item.productId === row.candidate.product.id)}
									rank={index + 1}
									distance={(resultSort === 'minimax' ? row.tradeoff.minimax : row.tradeoff.mean) ?? NaN}
									bands={evidence[0]?.bands ?? []}
									referenceEvidence={evidence}
									{compareReferences}
									tradeoff={row.tradeoff}
									{referenceNames}
									referenceProductId={resultItems.find(
										(i) => i.soundRelated && ['like', 'love'].includes(i.rating)
									)?.productId ?? ''}
									selected={overlays.includes(row.candidate.id)}
									limitReached={overlays.length >= 5}
									onshow={() => {
										toggleOverlay(row.candidate.id);
									}}
									onrate={rate}
								/>{/each}{/if}
					</ol>
					{#if result.data.results.length >= topK}<button
							class="button quiet show-more"
							type="button"
							disabled={loading}
							onclick={() => {
								change({ depth: String(topK + 20) });
							}}>Show more matches</button
						>{/if}{#if !result.data.results.length}<Notice
							>No eligible matches on this rig with these filters. Try a wider budget or reset reviewers.</Notice
						>{/if}
					<details class="analysis-caveats">
						<summary>Analysis caveats</summary>{#each result.data.caveats as caveat (caveat)}<p>
								{caveat}
							</p>{/each}
						<p>
							Measurements describe response on a coupler, not what you will hear. Fit matters; above 8 kHz is
							less reliable.
						</p>
					</details>{/if}
			</section>
		{/if}
	</div>
</div>
<Toast
	message={undoMessage}
	onundo={() => {
		if (!store) return;
		store.undo();
		profile = store.value;
		storageError = store.error;
		navigate(withItems(page.url.searchParams, profile.profiles[form]));
		undoMessage = '';
	}}
	ondismiss={() => {
		store?.dismiss();
		undoMessage = '';
	}}
/>

<style>
	.discover-grid {
		display: grid;
		grid-template-columns: minmax(0, 0.94fr) minmax(0, 1.06fr);
		gap: 0 48px;
		align-items: start;
	}
	.discovery-column {
		grid-column: 1;
		grid-row: 1;
		min-width: 0;
	}
	.chart-column {
		grid-column: 2;
		grid-row: 1 / span 2;
		position: sticky;
		top: 24px;
		min-width: 0;
	}
	.results {
		grid-column: 1;
		grid-row: 2;
		margin-top: 32px;
		min-width: 0;
	}
	.search {
		margin: 0 0 24px;
	}
	.workspace-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
	}
	.workspace-heading h2 {
		font-size: var(--text-lg);
	}
	.workspace-heading button,
	.profile-actions button {
		background: none;
		border: 0;
		padding: 8px 0;
		min-height: 36px;
		color: var(--accent);
		text-decoration: underline;
		font-size: var(--text-xs);
	}
	.profile-actions {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
		margin-block: 12px;
	}
	.compatible-rigs {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 12px;
		margin-top: 12px;
	}
	.compatible-rigs button {
		padding: 4px 0;
		min-height: 32px;
		background: none;
		border: 0;
		color: var(--accent);
		text-decoration: underline;
	}
	.refine,
	.workspace-tools {
		border-block: 1px solid var(--line);
		margin-top: 16px;
		font-size: var(--text-sm);
	}
	summary {
		padding: 14px 0;
		min-height: 44px;
		cursor: pointer;
	}
	summary span {
		color: var(--muted);
		font-size: var(--text-xs);
		margin-left: 12px;
	}
	.controls,
	.workspace-tools[open] {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 16px;
		padding-bottom: 20px;
	}
	select {
		display: block;
		width: 100%;
		margin-top: 8px;
	}
	.budget input {
		display: block;
		max-width: 220px;
		margin-top: 8px;
	}
	.workspace-tools h3 {
		margin-top: 12px;
		font-size: var(--text-sm);
	}
	.workspace-tools input[type='file'] {
		display: block;
		max-width: 100%;
		font-size: var(--text-xs);
		margin-top: 8px;
	}
	.corrections {
		border: 0;
		margin: 16px 0;
		padding: 0;
		display: grid;
		gap: 16px;
	}
	.distance-note,
	.analysis-caveats {
		font-size: var(--text-xs);
		color: var(--muted);
		margin: 12px 0 20px;
	}
	.analysis-caveats p {
		margin-top: 12px;
	}
	.result-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.chart-jump {
		display: none;
		min-height: 36px;
		align-items: center;
		font-size: var(--text-xs);
	}
	.updating {
		padding: 12px;
		border-left: 3px solid var(--accent);
		background: var(--accent-soft);
		font-size: var(--text-sm);
		margin-block: 16px;
	}
	.tradeoff-controls {
		display: grid;
		gap: 16px;
		margin-block: 20px;
	}
	.show-more {
		width: 100%;
		margin-block: 20px;
	}
	@media (max-width: 900px) {
		.discover-grid {
			grid-template-columns: 1fr;
			gap: 32px;
		}
		.discovery-column,
		.chart-column,
		.results {
			grid-column: 1;
			grid-row: auto;
			position: static;
		}
		.results {
			margin-top: 0;
		}
		.chart-jump {
			display: inline-flex;
		}
	}
</style>
