<script lang="ts">
	import { isInDay, percentOfDay, ribbonSpan, type RibbonSegment } from './trail';

	let {
		dayStart,
		dayEnd,
		segments,
		ticks,
		now,
		onselect,
	}: {
		dayStart: number;
		dayEnd: number;
		segments: RibbonSegment[];
		ticks: { at: number; label: string }[];
		now?: number;
		onselect?: (id: string) => void;
	} = $props();

	// Without a pinned `now`, the tick and running segments refresh once a minute.
	let clock = $state(Date.now());
	const current = $derived(now ?? clock);

	$effect(() => {
		if (now !== undefined) return;
		const id = setInterval(() => (clock = Date.now()), 60_000);
		return () => clearInterval(id);
	});

	const placed = $derived(
		segments.flatMap((segment) => {
			const span = ribbonSpan(segment.start, segment.end, current, dayStart, dayEnd);
			return span ? [{ segment, ...span }] : [];
		}),
	);
	const nowLeft = $derived(
		isInDay(current, dayStart, dayEnd) ? percentOfDay(current, dayStart, dayEnd) : null,
	);
	const captions = $derived(
		ticks
			.filter((tick) => isInDay(tick.at, dayStart, dayEnd))
			.map((tick) => {
				const left = percentOfDay(tick.at, dayStart, dayEnd);
				const edge = left <= 0.5 ? 'start' : left >= 99.5 ? 'end' : 'middle';
				return { ...tick, left, edge };
			}),
	);
</script>

<div class="ribbon">
	<div class="track">
		{#each placed as { segment, left, width } (segment.id)}
			<button
				type="button"
				class="segment"
				style:--blaze={`var(--ht-blaze-${segment.color})`}
				style:left={`${left}%`}
				style:width={`${width}%`}
				aria-label={segment.label}
				onclick={() => onselect?.(segment.id)}
			></button>
		{/each}
		{#if nowLeft !== null}
			<span class="now" style:left={`${nowLeft}%`} aria-hidden="true"></span>
		{/if}
	</div>
	<div class="captions" aria-hidden="true">
		{#each captions as caption (caption.at)}
			<span class="caption {caption.edge}" style:left={`${caption.left}%`}>{caption.label}</span>
		{/each}
	</div>
</div>

<style>
	.ribbon {
		display: grid;
		gap: var(--ht-space-2);
		min-width: 0;
	}

	.track {
		position: relative;
		height: var(--ht-ribbon-height);
		border-radius: var(--ht-radius-blaze);
		background: var(--ht-sunken);
	}

	.segment {
		position: absolute;
		inset-block: 0;
		min-width: 0;
		padding: 0;
		border: 0;
		background: var(--blaze);
	}

	/* Keep a touch target around a thin segment without changing its drawn size. */
	.segment::after {
		content: '';
		position: absolute;
		inset-block: calc((var(--ht-target) - var(--ht-ribbon-height)) / -2);
		inset-inline: calc(var(--ht-space-1) * -1);
	}

	.segment:focus-visible {
		z-index: var(--ht-z-nav);
	}

	.now {
		position: absolute;
		inset-block: calc(var(--ht-space-1) * -1);
		width: var(--ht-now-tick);
		margin-inline-start: calc(var(--ht-now-tick) / -2);
		background: var(--ht-ink);
	}

	.captions {
		position: relative;
		height: var(--ht-space-5);
		font: var(--ht-type-caption);
		color: var(--ht-ink-2);
	}

	.caption {
		position: absolute;
		top: 0;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		transform: translateX(-50%);
	}

	.caption.start {
		transform: none;
	}

	.caption.end {
		transform: translateX(-100%);
	}
</style>
