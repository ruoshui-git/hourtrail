<script lang="ts">
	import GapRow from './GapRow.svelte';
	import type { TrailRow } from './trail';

	let {
		rows,
		onselect,
		onaddgap,
	}: {
		rows: TrailRow[];
		onselect?: (id: string) => void;
		onaddgap?: (gap: { start: number; end: number }) => void;
	} = $props();
</script>

<ul class="trail">
	{#each rows as row (row.id)}
		<li>
			{#if row.kind === 'gap'}
				<GapRow
					durationLabel={row.durationLabel}
					rangeLabel={row.rangeLabel}
					onadd={() => onaddgap?.({ start: row.start, end: row.end })}
				/>
			{:else}
				<button
					type="button"
					class="session"
					style:--blaze={`var(--ht-blaze-${row.typeColor})`}
					onclick={() => onselect?.(row.id)}
				>
					<span class="time">
						<span class="caption">{row.startLabel}</span>
						{#if row.endLabel || row.running}
							<span class="caption muted">{row.endLabel ?? 'Running'}</span>
						{/if}
					</span>
					<span class="rail" aria-hidden="true"><span class="segment"></span></span>
					<span class="body">
						<span class="name" class:untitled={row.name === null}
							>{row.name ?? 'Untitled session'}</span
						>
						<span class="meta"
							>{row.placeName ? `${row.typeName} at ${row.placeName}` : row.typeName}</span
						>
						{#if row.note}<span class="note">{row.note.split('\n')[0]}</span>{/if}
						{#if row.continuesFromPreviousDay}
							<span class="caption muted">Continued from yesterday</span>
						{/if}
						{#if row.continuesNextDay}
							<span class="caption muted">Continues tomorrow</span>
						{/if}
					</span>
					<span class="duration">
						{#if row.pending}
							<span class="pending" role="img" aria-label="Not backed up yet"></span>
						{/if}
						{row.durationLabel}
					</span>
				</button>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.trail {
		display: grid;
		min-width: 0;
	}

	/* Columns match GapRow: time, rail, body, duration. */
	.session {
		display: grid;
		grid-template-columns:
			calc(var(--ht-space-8) + var(--ht-space-2)) var(--ht-rail-width) minmax(0, 1fr)
			auto;
		align-items: stretch;
		width: 100%;
		min-height: var(--ht-target);
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--ht-ink);
		text-align: start;
	}

	@media (hover: hover) {
		.session:hover {
			background: var(--ht-hover);
		}
	}

	/* Padding lives on the columns, not the button, so the rail runs the whole row height. */
	.time {
		display: grid;
		align-content: start;
		gap: var(--ht-space-1);
		padding: var(--ht-space-3) var(--ht-space-3) var(--ht-space-3) 0;
		min-width: 0;
	}

	.caption {
		font: var(--ht-type-caption);
		color: var(--ht-ink-2);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.muted {
		color: var(--ht-ink-3);
	}

	.rail {
		position: relative;
	}

	/* The trail line runs the full height of every row. */
	.rail::before {
		content: '';
		position: absolute;
		inset-block: 0;
		inset-inline-start: 50%;
		border-inline-start: var(--ht-hairline) solid var(--ht-line);
	}

	.segment {
		position: absolute;
		inset-block: 0;
		inset-inline-start: 50%;
		width: var(--ht-rail-segment);
		margin-inline-start: calc(var(--ht-rail-segment) / -2);
		border-radius: var(--ht-radius-blaze);
		background: var(--blaze);
	}

	.body {
		display: grid;
		align-content: start;
		gap: var(--ht-space-1);
		min-width: 0;
		padding: var(--ht-space-3);
	}

	.name {
		font: var(--ht-type-body-strong);
		overflow-wrap: anywhere;
	}

	.name.untitled {
		font-weight: var(--ht-weight-regular);
		color: var(--ht-ink-2);
	}

	.meta,
	.note {
		font: var(--ht-type-label);
		color: var(--ht-ink-2);
		overflow-wrap: anywhere;
	}

	.note {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.duration {
		display: flex;
		align-items: center;
		gap: var(--ht-space-2);
		padding: var(--ht-space-3) 0;
		align-self: start;
		font: var(--ht-type-label);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.pending {
		width: var(--ht-space-2);
		height: var(--ht-space-2);
		border: var(--ht-hairline) solid var(--ht-ink-2);
		border-radius: var(--ht-radius-chip);
	}
</style>
