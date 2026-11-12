<script lang="ts">
	import Button from './Button.svelte';

	let {
		durationLabel,
		rangeLabel,
		onadd,
	}: { durationLabel: string; rangeLabel: string; onadd: () => void } = $props();
</script>

<div class="gap">
	<span class="time" aria-hidden="true"></span>
	<span class="rail" aria-hidden="true"></span>
	<div class="text">
		<p class="summary">{durationLabel} not recorded</p>
		<p class="range">{rangeLabel}</p>
	</div>
	<Button variant="quiet" size="sm" onclick={onadd}>Add</Button>
</div>

<style>
	/* Same columns as TrailList rows, so the rail lines up across kinds of row. */
	.gap {
		display: grid;
		grid-template-columns:
			calc(var(--ht-space-8) + var(--ht-space-2)) var(--ht-rail-width) minmax(0, 1fr)
			auto;
		align-items: center;
		min-height: var(--ht-target);
	}

	.time {
		grid-column: 1;
	}

	.rail {
		grid-column: 2;
		align-self: stretch;
		position: relative;
	}

	.rail::before {
		content: '';
		position: absolute;
		inset-block: 0;
		inset-inline-start: 50%;
		border-inline-start: var(--ht-hairline) dashed var(--ht-ink-3);
	}

	.text {
		grid-column: 3;
		display: grid;
		gap: var(--ht-space-1);
		min-width: 0;
		padding: var(--ht-space-3);
	}

	.summary {
		font: var(--ht-type-label);
		color: var(--ht-ink-3);
	}

	.range {
		font: var(--ht-type-caption);
		color: var(--ht-ink-3);
		font-variant-numeric: tabular-nums;
	}
</style>
