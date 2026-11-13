<script lang="ts">
	import type { RecordOf } from '@hourtrail/core';
	import { formatMinutes } from '$lib/format';
	import MatchText from './MatchText.svelte';

	let {
		sessions,
		items,
		types,
		places,
		query,
		now,
		format = 'hm',
		onselect,
	}: {
		sessions: RecordOf<'session'>[];
		items: RecordOf<'work_item'>[];
		types: RecordOf<'activity_type'>[];
		places: RecordOf<'place'>[];
		query: string;
		now: number;
		format?: 'hm' | 'decimal';
		onselect: (id: string) => void;
	} = $props();
</script>

<ul class="trail">
	{#each sessions as session (session.id)}
		{@const item = items.find((entry) => entry.id === session.work_item_id)}
		{@const type = types.find((entry) => entry.id === session.type_id)}
		{@const place = places.find((entry) => entry.id === (session.place_id ?? item?.place_id))}
		<li>
			<button
				class="session"
				style:--blaze={`var(--ht-blaze-${type?.color ?? 'lake'})`}
				onclick={() => onselect(session.id)}
			>
				<span class="time">
					{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
						session.start_at,
					)}
				</span>
				<span class="rail" aria-hidden="true"><span class="segment"></span></span>
				<span class="body">
					<span class="name"><MatchText text={item?.name ?? 'Untitled session'} {query} /></span>
					<span class="meta"
						>{type?.name ?? 'Work'}{#if place}
							at <MatchText text={place.name} {query} />{/if}</span
					>
					{#if session.note}<span class="note"
							><MatchText text={session.note.split('\n')[0] ?? ''} {query} /></span
						>{/if}
				</span>
				<span class="duration"
					>{formatMinutes(
						Math.round(((session.end_at ?? now) - session.start_at) / 60_000),
						format,
					)}</span
				>
			</button>
		</li>
	{/each}
</ul>

<style>
	.trail {
		display: grid;
		min-width: 0;
	}

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

	.time,
	.body,
	.duration {
		padding-block: var(--ht-space-3);
	}

	.time,
	.duration {
		font: var(--ht-type-caption);
		color: var(--ht-ink-2);
		white-space: nowrap;
	}

	.rail {
		position: relative;
	}

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
		padding-inline: var(--ht-space-3);
	}

	.name {
		font: var(--ht-type-body-strong);
		overflow-wrap: anywhere;
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
		align-self: start;
		font-variant-numeric: tabular-nums;
	}
</style>
