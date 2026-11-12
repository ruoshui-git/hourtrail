<script lang="ts">
	import { formatElapsed } from './timer';
	let { ms, size = 'timer' }: { ms: number; size?: 'timer' | 'figure' } = $props();
	const formatted = $derived(formatElapsed(ms));
</script>

<span class="timer" class:figure={size === 'figure'} role="timer" aria-label={formatted}
	><span aria-hidden="true"
		>{#each [...formatted] as character, index (index)}<span
				class="cell"
				class:colon={character === ':'}>{character}</span
			>{/each}</span
	></span
>

<style>
	.timer {
		display: inline-block;
		font: var(--ht-type-timer);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.figure {
		font: var(--ht-type-figure);
	}

	.cell {
		display: inline-block;
		width: var(--ht-timer-digit);
		text-align: center;
	}

	.colon {
		width: var(--ht-timer-colon);
	}
</style>
