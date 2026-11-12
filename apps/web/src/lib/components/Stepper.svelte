<script lang="ts">
	import { Minus, Plus } from '@lucide/svelte';
	import Button from './Button.svelte';
	const id = $props.id();
	let {
		value = $bindable(0),
		label,
		min = -Infinity,
		max = Infinity,
		step = 1,
		unit,
		disabled = false,
	}: {
		value?: number;
		label: string;
		min?: number;
		max?: number;
		step?: number;
		unit?: string;
		disabled?: boolean;
	} = $props();
	function clamp(next: number) {
		return Math.min(max, Math.max(min, next));
	}
</script>

<div class="stepper">
	<label for={id}>{label}</label>
	<div class="controls">
		<Button variant="secondary" {disabled} onclick={() => (value = clamp(value - step))}
			><Minus aria-hidden="true" /><span class="ht-visually-hidden">Decrease {label}</span></Button
		>
		<input
			{id}
			type="number"
			min={Number.isFinite(min) ? min : undefined}
			max={Number.isFinite(max) ? max : undefined}
			{step}
			{disabled}
			{value}
			aria-describedby={unit ? `${id}-unit` : undefined}
			oninput={(event) => {
				if (event.currentTarget.value !== '') {
					value = clamp(event.currentTarget.valueAsNumber);
					event.currentTarget.value = String(value);
				}
			}}
			onblur={(event) => {
				value = clamp(value);
				event.currentTarget.value = String(value);
			}}
		/>
		<Button variant="secondary" {disabled} onclick={() => (value = clamp(value + step))}
			><Plus aria-hidden="true" /><span class="ht-visually-hidden">Increase {label}</span></Button
		>
	</div>
	{#if unit}<span class="unit" id={`${id}-unit`}>{unit}</span>{/if}
</div>

<style>
	.stepper {
		display: grid;
		gap: var(--ht-space-2);
		min-width: 0;
	}

	label,
	.unit {
		font: var(--ht-type-label);
	}

	.unit {
		color: var(--ht-ink-2);
	}

	.controls {
		display: grid;
		grid-template-columns: var(--ht-control-height) minmax(0, 1fr) var(--ht-control-height);
		gap: var(--ht-space-2);
	}

	.controls :global(button) {
		padding: 0;
	}

	.controls :global(svg) {
		width: var(--ht-icon);
		height: var(--ht-icon);
		stroke-width: var(--ht-icon-stroke);
	}

	input {
		width: 100%;
		min-width: 0;
		height: var(--ht-control-height);
		border: var(--ht-hairline) solid var(--ht-line-strong);
		border-radius: var(--ht-radius-control);
		padding: var(--ht-space-2);
		text-align: center;
		background: var(--ht-surface);
		font: var(--ht-type-body);
	}

	input:disabled {
		background: var(--ht-sunken);
		color: var(--ht-ink-3);
	}
</style>
