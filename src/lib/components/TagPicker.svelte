<script lang="ts">
	let {
		label = 'Reasons (optional)',
		options,
		selected = $bindable([]),
		onchange
	}: {
		label?: string;
		options: readonly string[];
		selected?: string[];
		onchange?: (selected: string[]) => void;
	} = $props();
</script>

<fieldset>
	<legend class="field-label">{label}</legend>
	<div>
		{#each options as option (option)}<label
				><input
					type="checkbox"
					checked={selected.includes(option)}
					onchange={(event) => {
						selected = event.currentTarget.checked
							? [...selected, option]
							: selected.filter((item) => item !== option);
						onchange?.(selected);
					}}
				/><span
					>{#if selected.includes(option)}<svg
							width="12"
							height="12"
							viewBox="0 0 12 12"
							aria-hidden="true"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"><path d="m2 6 2.5 2.5L10 3" /></svg
						>{/if}{option}</span
				></label
			>{/each}
	</div>
</fieldset>

<style>
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
	}
	fieldset > div {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	label {
		position: relative;
	}
	input {
		position: absolute;
		opacity: 0;
		width: 100%;
		height: 100%;
		margin: 0;
	}
	span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 12px;
		min-height: 36px;
		border: var(--hairline) solid var(--line);
		border-radius: var(--radius);
		font-size: var(--text-sm);
		cursor: pointer;
	}
	input:checked + span {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}
	input:focus-visible + span {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}
</style>
