<script lang="ts">
	let {
		label,
		value = $bindable(0),
		min = 0,
		max = 100,
		step = 1,
		unit = '',
		disabled = false,
		onchange
	}: {
		label: string;
		value?: number;
		min?: number;
		max?: number;
		step?: number;
		unit?: string;
		disabled?: boolean;
		onchange?: (value: number) => void;
	} = $props();
	const id = $props.id();
	function update(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		if (!Number.isFinite(input.valueAsNumber)) return;
		value = Math.min(max, Math.max(min, Math.round((input.valueAsNumber - min) / step) * step + min));
		onchange?.(value);
	}
</script>

<div class="slider">
	<label class="field-label" for={id}>{label}</label>
	<div class="row">
		<input
			{id}
			type="range"
			{min}
			{max}
			{step}
			{value}
			{disabled}
			oninput={update}
			aria-valuetext={`${value}${unit ? ` ${unit}` : ''}`}
		/><input
			class="text-input numeric"
			type="number"
			{min}
			{max}
			{step}
			{value}
			{disabled}
			onchange={update}
			aria-label={`${label}, numeric value`}
		/><span class="muted small">{unit}</span>
	</div>
</div>

<style>
	input[type='range'] {
		flex: 1;
		min-width: 80px;
		height: 44px;
		accent-color: var(--accent);
	}
	.numeric {
		width: 80px;
		font-family: var(--mono);
		font-size: var(--text-sm);
	}
</style>
