<script lang="ts">
	let {
		label,
		checked = $bindable(false),
		disabled = false,
		onchange
	}: {
		label: string;
		checked?: boolean;
		disabled?: boolean;
		onchange?: (checked: boolean) => void;
	} = $props();
</script>

<label class="toggle" class:disabled
	><input
		type="checkbox"
		role="switch"
		bind:checked
		{disabled}
		onchange={(event) => onchange?.(event.currentTarget.checked)}
	/><span class="track" aria-hidden="true"><span></span></span><span>{label}</span></label
>

<style>
	.toggle {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		font-size: var(--text-sm);
		cursor: pointer;
	}
	input {
		position: absolute;
		width: 36px;
		height: 24px;
		opacity: 0;
	}
	.track {
		width: 34px;
		height: 20px;
		background: var(--strong-line);
		border-radius: 12px;
		padding: 3px;
		transition: background var(--motion);
	}
	.track span {
		display: block;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--surface);
		transition: transform var(--motion);
	}
	input:checked + .track {
		background: var(--accent);
	}
	input:checked + .track span {
		transform: translateX(14px);
		background: var(--accent-ink);
	}
	input:focus-visible + .track {
		outline: 2px solid var(--accent);
		outline-offset: 4px;
	}
	input:disabled ~ span {
		opacity: 0.5;
	}
	.toggle.disabled {
		cursor: not-allowed;
	}
</style>
