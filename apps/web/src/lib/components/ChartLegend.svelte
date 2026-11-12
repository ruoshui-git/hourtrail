<script lang="ts">
	import Blaze from './Blaze.svelte';
	import type { ChartSeries } from './chart';
	let { series }: { series: ChartSeries[] } = $props();
</script>

<ul class="legend" aria-label="Legend">
	{#each series as item (item.key)}<li>
			<Blaze color={item.color} size="sm" /><span>{item.label}</span>
		</li>{/each}
</ul>

<style>
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--ht-space-2) var(--ht-space-4);
		font: var(--ht-type-label);
		color: var(--ht-ink);
	}

	li {
		display: inline-flex;
		align-items: center;
		gap: var(--ht-space-2);
		min-width: 0;
		overflow-wrap: anywhere;
	}
</style>
