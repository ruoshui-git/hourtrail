<script lang="ts">
	import { HBarList, SegmentedControl } from '$lib/components';
	import type { BreakdownItem } from './domain';

	type BreakdownSet = { value: string; label: string; title: string; items: BreakdownItem[] };
	let { sets, format = 'hm' }: { sets: BreakdownSet[]; format?: 'hm' | 'decimal' } = $props();

	let choice = $state('work_items');
	const active = $derived(sets.find((set) => set.value === choice) ?? sets[0]);
</script>

{#if active}
	<div class="breakdowns">
		<SegmentedControl label="Breakdown" options={sets} bind:value={choice} />
		<HBarList title={active.title} items={active.items} {format} />
		<!-- No table here: HBarList prints every name and value as text beside its bar, which
		     meets the rule that a chart's numbers are also available as text. -->
	</div>
{/if}

<style>
	.breakdowns {
		display: grid;
		gap: var(--ht-space-4);
		min-width: 0;
	}
</style>
