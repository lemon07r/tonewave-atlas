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
	function precision(number: number): number {
		const [mantissa = '', exponent = '0'] = String(number).split('e');
		return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent));
	}
	function update(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		if (!Number.isFinite(input.valueAsNumber)) return;
		const snapped = Math.round((input.valueAsNumber - min) / step) * step + min;
		const rounded = Number(snapped.toFixed(Math.min(100, Math.max(precision(step), precision(min)))));
		value = Math.min(max, Math.max(min, rounded));
		input.value = String(value);
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
