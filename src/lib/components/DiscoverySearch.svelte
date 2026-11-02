<script lang="ts">
	import SearchCombobox from './SearchCombobox.svelte';
	import SegmentedControl from './SegmentedControl.svelte';
	import Rating from './Rating.svelte';
	import TagPicker from './TagPicker.svelte';
	let {
		headphones = false,
		mode = $bindable('similar')
	}: { headphones?: boolean; mode?: 'similar' | 'profile' } = $props();
</script>

<div class="discovery-mode">
	<SegmentedControl
		label="Discovery mode"
		options={[
			{ value: 'similar', label: headphones ? 'Similar to one headphone' : 'Similar to one IEM' },
			{ value: 'profile', label: 'Match my taste profile' }
		]}
		bind:value={mode}
	/>
</div>
{#if mode === 'similar'}
	<SearchCombobox
		items={[]}
		label={headphones ? 'A headphone you enjoy' : 'An IEM you enjoy'}
		placeholder="Search by brand or model"
		shortcut
		emptyText="The measurement catalog is not connected yet. No products are available to search."
		onselect={() => {
			/* Phase 2 connects the catalog and analysis worker. */
		}}
	/>
	<p class="search-note">
		Matches will use measurements from the same rig family once the catalog is connected.
	</p>
{:else}
	<section class="profile-panel" aria-label="Your taste profile">
		<div>
			<h2>No {headphones ? 'headphones' : 'IEMs'} in your profile yet.</h2>
			<p>
				Add products you know, rate each one, and optionally choose reasons. Your profile can include
				different kinds of sound you enjoy.
			</p>
		</div>
		<SearchCombobox
			items={[]}
			label={headphones ? 'Add a headphone to your profile' : 'Add an IEM to your profile'}
			placeholder="Search by brand or model"
			shortcut
			emptyText="The measurement catalog is not connected yet. No products can be added in this preview."
			onselect={() => {
				/* Phase 2 adds a real catalog product to the profile. */
			}}
		/>
		<p class="search-note">
			Matches will use measurements from the same rig family once the catalog is connected.
		</p>
		<p class="catalog-note">
			The catalog is not connected yet. Ratings and reasons become available after adding a product.
		</p>
		<fieldset disabled class="profile-inputs">
			<legend class="sr-only">Rate an added product and choose optional reasons</legend><Rating
				label="Rate each product"
			/><TagPicker options={['Bass weight', 'Vocal balance', 'Treble texture']} />
		</fieldset>
		<p class="privacy-note">Profiles will stay in your browser. No account required.</p>
	</section>
{/if}

<style>
	.discovery-mode {
		margin-bottom: 24px;
	}
	.discovery-mode :global(.segmented) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		width: 100%;
	}
	.discovery-mode :global(label),
	.discovery-mode :global(span) {
		width: 100%;
	}
	.discovery-mode :global(span) {
		justify-content: center;
		text-align: center;
	}
	.profile-panel {
		display: grid;
		gap: 20px;
	}
	.search-note {
		font-size: var(--text-xs);
		color: var(--muted);
		margin-top: 12px;
	}
	.profile-panel .search-note {
		font-size: var(--text-xs);
		margin-top: -8px;
	}
	.profile-panel h2 {
		font-size: var(--text-lg);
		margin-bottom: 8px;
	}
	.profile-panel p {
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.profile-panel .catalog-note,
	.profile-panel .privacy-note {
		font-size: var(--text-xs);
	}
	.profile-inputs {
		display: grid;
		gap: 20px;
		border: 0;
		padding: 0;
		margin: 0;
		opacity: 0.55;
	}
	.privacy-note {
		border-top: var(--hairline) solid var(--line);
		padding-top: 16px;
	}
	@media (max-width: 640px) {
		.discovery-mode :global(span) {
			padding: 8px;
			font-size: var(--text-xs);
			min-height: 48px;
		}
	}
</style>
