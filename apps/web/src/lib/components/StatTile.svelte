<script lang="ts">
	let {
		label,
		value,
		secondary,
		size = 'lg',
	}: { label: string; value: string; secondary?: string; size?: 'lg' | 'md' } = $props();
</script>

<div class="stat" class:medium={size === 'md'}>
	<p class="value">{value}</p>
	<p class="label">{label}</p>
	{#if secondary}<p class="label secondary">{secondary}</p>{/if}
</div>

<style>
	.stat {
		display: grid;
		gap: var(--ht-space-1);
		min-width: 0;
	}

	.value {
		font: var(--ht-type-figure);
		font-variant-numeric: tabular-nums;
		color: var(--ht-ink);
		overflow-wrap: anywhere;
	}

	.medium .value {
		font: var(--ht-type-heading);
	}

	.label {
		font: var(--ht-type-label);
		color: var(--ht-ink-2);
		overflow-wrap: anywhere;
	}
</style>
