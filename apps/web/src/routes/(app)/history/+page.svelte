<script lang="ts">
	import { formatMinutes } from '$lib/format';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { addDays, dayOf, dayBounds, readSetting, type Day } from '@hourtrail/core';
	import { Banner, Button, DayRibbon, EmptyState, TrailList } from '$lib/components';
	import { db } from '$lib/db/app';
	import { live } from '$lib/live.svelte';
	import { openNewSession, openSessionEditor } from '$lib/features/session/editor.svelte';
	import { buildDay } from '$lib/features/history/domain';

	const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const initialNow = Date.now();
	let now = $state(initialNow);
	let timer: ReturnType<typeof setInterval>;
	$effect(() => {
		timer = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(timer);
	});
	const data = live(
		async () => {
			const [sessions, items, types, places, setting, outbox] = await Promise.all([
				db.session.toArray(),
				db.work_item.toArray(),
				db.activity_type.toArray(),
				db.place.toArray(),
				db.setting.get('reporting_tz'),
				db.outbox.toArray(),
			]);
			const gap = await db.setting.get('long_gap_min');
			return {
				sessions,
				items,
				types,
				places,
				zone: readSetting('reporting_tz', setting?.value) ?? deviceZone,
				gap: readSetting('long_gap_min', gap?.value),
				outbox,
			};
		},
		{ sessions: [], items: [], types: [], places: [], zone: deviceZone, gap: 60, outbox: [] },
	);
	const urlDay = $derived(page.url.searchParams.get('day'));
	const today = $derived(dayOf(now, data.current.zone));
	const selectedDay: Day = $derived(
		urlDay && /^\d{4}-\d{2}-\d{2}$/.test(urlDay) && dayBoundsValid(urlDay) ? urlDay : today,
	);
	function dayBoundsValid(day: string): boolean {
		try {
			dayBounds(day, data.current.zone);
			return true;
		} catch {
			return false;
		}
	}
	const model = $derived.by(() =>
		buildDay(
			selectedDay,
			data.current.zone,
			data.current.sessions.filter((s) => s.deleted_at === null),
			data.current.items.filter((i) => i.deleted_at === null),
			data.current.types.filter((t) => t.deleted_at === null),
			data.current.places.filter((p) => p.deleted_at === null),
			{ long_gap_min: typeof data.current.gap === 'number' ? data.current.gap : 60 },
			now,
		),
	);
	const pendingIds = $derived(
		new Set(
			data.current.outbox.flatMap((entry) =>
				entry.mutation.record_id ? [entry.mutation.record_id] : [],
			),
		),
	);
	const rows = $derived(
		model.rows.map((row) =>
			row.kind === 'session' && pendingIds.has(row.id) ? { ...row, pending: true } : row,
		),
	);
	const dayTitle = $derived(
		new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(
			new Date(`${selectedDay}T12:00:00`),
		),
	);
	const isToday = $derived(selectedDay === today);
	const shortDuration = formatMinutes;
	async function selectDay(day: string) {
		await goto(resolve(day === today ? '/history' : `/history?day=${day}`));
	}
	function addEmptySession() {
		const start = dayBounds(selectedDay, data.current.zone).start + 9 * 60 * 60_000;
		openNewSession({ start_at: start, end_at: start + 60 * 60_000 });
	}
	function addGap(gap: { start: number; end: number }) {
		openNewSession({ start_at: gap.start, end_at: gap.end });
	}
</script>

<svelte:head><title>History · Hourtrail</title></svelte:head>
<section class="history">
	<header>
		<h1>{dayTitle}</h1>
		<nav aria-label="History day navigation">
			<Button variant="secondary" size="sm" onclick={() => selectDay(addDays(selectedDay, -1))}
				>Previous day</Button
			>
			{#if !isToday}<Button variant="quiet" size="sm" onclick={() => selectDay(today)}>Today</Button
				>{/if}
			<Button
				variant="secondary"
				size="sm"
				disabled={isToday}
				onclick={() => selectDay(addDays(selectedDay, 1))}>Next day</Button
			>
		</nav>
	</header>
	{#if data.current.zone !== deviceZone}
		<Banner message={`Days are shown in ${data.current.zone}.`} />
	{/if}
	<DayRibbon
		dayStart={model.dayStart}
		dayEnd={model.dayEnd}
		segments={model.segments}
		ticks={model.ticks}
		{now}
		onselect={openSessionEditor}
	/>
	<p class="totals">
		{shortDuration(model.totals.work)} work, {shortDuration(model.totals.other)} other
	</p>
	{#if rows.some((row) => row.kind === 'session')}
		<TrailList {rows} onselect={openSessionEditor} onaddgap={addGap} />
	{:else}
		<EmptyState
			message="No sessions on this day."
			actionLabel="Add session"
			onaction={addEmptySession}
		/>
	{/if}
</section>

<style>
	.history {
		display: grid;

		/* minmax(0, 1fr): never let a wide child widen the page past the gutter. */
		grid-template-columns: minmax(0, 1fr);
		gap: var(--ht-space-4);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--ht-space-3);
		flex-wrap: wrap;
	}

	h1 {
		margin: 0;
		font: var(--ht-type-title);
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--ht-space-2);
	}

	nav :global(button) {
		white-space: nowrap;
		padding-inline: var(--ht-space-2);
	}

	.totals {
		margin: 0;
		font: var(--ht-type-label);
		color: var(--ht-ink-2);
	}
</style>
