<script lang="ts">
	import { RadioGroup } from 'bits-ui';
	let {
		value = $bindable(''),
		label,
		options,
	}: { value?: string; label: string; options: { value: string; label: string }[] } = $props();
</script>

<RadioGroup.Root bind:value aria-label={label} orientation="horizontal" class="ht-segments">
	{#each options as option (option.value)}<RadioGroup.Item value={option.value} class="ht-segment"
			>{option.label}</RadioGroup.Item
		>{/each}
</RadioGroup.Root>

<style>
	:global(.ht-segments) {
		display: flex;
		flex-wrap: wrap;
		gap: var(--ht-space-1);
		padding: var(--ht-space-1);
		border-radius: var(--ht-radius-control);
		background: var(--ht-sunken);
	}

	:global(.ht-segment) {
		flex: 1;
		min-width: var(--ht-target);
		min-height: var(--ht-target);
		padding: var(--ht-space-2) var(--ht-space-3);
		border: var(--ht-hairline) solid transparent;
		border-radius: var(--ht-radius-control);
		background: transparent;
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
		overflow-wrap: anywhere;
		transition:
			background var(--ht-duration-press) var(--ht-ease),
			transform var(--ht-duration-press) var(--ht-ease);
	}

	:global(.ht-segment[data-state='checked']) {
		background: var(--ht-surface);
		border-color: var(--ht-line-strong);
		color: var(--ht-ink);
		font-weight: var(--ht-weight-strong);
	}

	@media (hover: hover) {
		:global(.ht-segment[data-state='unchecked']:hover) {
			background: var(--ht-hover);
		}
	}

	:global(.ht-segment:active) {
		background: var(--ht-pressed);
		transform: scale(var(--ht-press-scale));
	}
</style>
