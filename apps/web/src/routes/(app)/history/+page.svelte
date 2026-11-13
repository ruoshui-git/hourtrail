<script lang="ts">
	import { formatMinutes } from '$lib/format';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import {
		addDays,
		dayOf,
		dayBounds,
		readSetting,
		review,
		openIssueCount,
		toLocalDateTime,
		type Day,
	} from '@hourtrail/core';
	import { Banner, Button, DayRibbon, EmptyState, FilterChip, TrailList } from '$lib/components';
	import { db } from '$lib/db/app';
	import { live } from '$lib/live.svelte';
	import { openNewSession, openSessionEditor } from '$lib/features/session/editor.svelte';
	import { buildDay } from '$lib/features/history/domain';
	import { searchSessions } from '$lib/features/search/search';
	import { formatClock } from '$lib/components/trail';
	import MatchText from '$lib/features/search/MatchText.svelte';
	import SearchRows from '$lib/features/search/SearchRows.svelte';
	import SessionEditor from '$lib/features/session/SessionEditor.svelte';

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
			const [
				sessions,
				items,
				types,
				places,
				setting,
				outbox,
				conflicts,
				marks,
				longSession,
				notePrompt,
				durationSetting,
			] = await Promise.all([
				db.session.toArray(),
				db.work_item.toArray(),
				db.activity_type.toArray(),
				db.place.toArray(),
				db.setting.get('reporting_tz'),
				db.outbox.toArray(),
				db.conflict.toArray(),
				db.review_mark.toArray(),
				db.setting.get('long_session_min'),
				db.setting.get('note_prompt'),
				db.setting.get('duration_format'),
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
				conflicts,
				marks,
				longSession: readSetting('long_session_min', longSession?.value) ?? 600,
				notePrompt: readSetting('note_prompt', notePrompt?.value) ?? 'work',
				durationFormat: readSetting('duration_format', durationSetting?.value) ?? 'hm',
			};
		},
		{
			sessions: [],
			items: [],
			types: [],
			places: [],
			zone: deviceZone,
			gap: 60,
			outbox: [],
			conflicts: [],
			marks: [],
			longSession: 600,
			notePrompt: 'work' as const,
			durationFormat: 'hm' as const,
		},
	);
	const projects = live(() => db.project.toArray(), []);
	const query = $derived(page.url.searchParams.get('q') ?? '');
	const selectedId = $derived(page.url.searchParams.get('session'));
	const selectedTypes = $derived(page.url.searchParams.getAll('type'));
	let typeChipStates = $state<Record<string, boolean>>({});
	let clearingFilters = false;
	const filterTypes = $derived(
		data.current.types.filter(
			(type) => type.deleted_at === null && typeChipStates[type.id] !== undefined,
		),
	);
	const projectId = $derived(page.url.searchParams.get('project') ?? '');
	const placeId = $derived(page.url.searchParams.get('place') ?? '');
	const from = $derived(page.url.searchParams.get('from') ?? '');
	const to = $derived(page.url.searchParams.get('to') ?? '');
	const filtered = $derived(
		!!(query || selectedTypes.length || projectId || placeId || from || to),
	);
	const searchResult = $derived(
		searchSessions(
			{ ...data.current, projects: projects.current },
			{ query, types: selectedTypes, project: projectId, place: placeId, from, to },
			data.current.zone,
			now,
		),
	);
	$effect(() => {
		if (clearingFilters) return;
		for (const type of data.current.types.filter((entry) => entry.deleted_at === null)) {
			const active = selectedTypes.includes(type.id);
			if (typeChipStates[type.id] === undefined) typeChipStates[type.id] = active;
			else if (typeChipStates[type.id] !== active) void updateFilter('type', type.id, true);
		}
	});
	let desktop = $state(false);
	$effect(() => {
		const media = matchMedia('(min-width: 1024px)');
		const update = () => (desktop = media.matches);
		update();
		media.addEventListener('change', update);
		return () => media.removeEventListener('change', update);
	});
	async function updateFilter(key: string, value: string, multi = false) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		if (multi) {
			const values = params.getAll(key);
			params.delete(key);
			for (const item of values.filter((entry) => entry !== value)) params.append(key, item);
			if (!values.includes(value)) params.append(key, value);
		} else if (value) params.set(key, value);
		else params.delete(key);
		await goto(resolve(`/history?${params.toString()}`), { keepFocus: true, noScroll: true });
	}
	async function clearFilters() {
		clearingFilters = true;
		for (const type of data.current.types) typeChipStates[type.id] = false;
		await goto(resolve('/history'), { keepFocus: true, noScroll: true });
		clearingFilters = false;
	}
	async function setPreset(preset: string) {
		const currentDay = dayOf(now, data.current.zone);
		const start =
			preset === 'This month'
				? `${currentDay.slice(0, 7)}-01`
				: addDays(currentDay, preset === 'Last 7 days' ? -6 : -29);
		const params = new SvelteURLSearchParams(page.url.searchParams);
		params.set('from', `${start}T00:00`);
		params.set('to', toLocalDateTime(now, data.current.zone));
		await goto(resolve(`/history?${params.toString()}`), { keepFocus: true, noScroll: true });
	}
	async function selectSession(id: string) {
		if (!desktop) {
			openSessionEditor(id);
			return;
		}
		const params = new SvelteURLSearchParams(page.url.searchParams);
		params.set('session', id);
		await goto(resolve(`/history?${params.toString()}`), { keepFocus: true, noScroll: true });
	}
	async function clearSelectedSession() {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		params.delete('session');
		await goto(resolve(`/history?${params.toString()}`), { keepFocus: true, noScroll: true });
	}
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
			{
				long_gap_min: typeof data.current.gap === 'number' ? data.current.gap : 60,
				duration_format: data.current.durationFormat,
			},
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
	const dayOpenIssues = $derived(
		openIssueCount(
			review(selectedDay, {
				sessions: data.current.sessions,
				items: data.current.items,
				types: data.current.types,
				places: data.current.places,
				conflicts: data.current.conflicts,
				marks: data.current.marks,
				settings: {
					long_gap_min: typeof data.current.gap === 'number' ? data.current.gap : 60,
					long_session_min: data.current.longSession,
					note_prompt: data.current.notePrompt,
				},
				tz: data.current.zone,
				now,
				formatTime: (instant) => formatClock(instant),
			}),
		),
	);
	const shortDuration = (minutes: number) => formatMinutes(minutes, data.current.durationFormat);
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
<section class:two-pane={desktop} class="history">
	{#if desktop}<a class="skip-editor" href="#history-editor">Skip to session editor</a>{/if}
	<div class="left-pane">
		<div class="search-controls">
			<label class="search-label"
				>Search sessions<input
					aria-label="Search sessions"
					type="search"
					value={query}
					oninput={(event) => updateFilter('q', event.currentTarget.value)}
					placeholder="Search work, notes, projects, places"
				/></label
			>
			<div class="filters" aria-label="Session filters">
				<div class="presets" role="group" aria-label="Date range presets">
					{#each ['Last 7 days', 'Last 30 days', 'This month'] as preset (preset)}
						<Button variant="secondary" size="sm" onclick={() => setPreset(preset)}>{preset}</Button
						>
					{/each}
				</div>
				{#each filterTypes as type (type.id)}<FilterChip
						label={type.name}
						bind:selected={typeChipStates[type.id]}
					/>{/each}
				<select
					aria-label="Project"
					value={projectId}
					onchange={(event) => updateFilter('project', event.currentTarget.value)}
					><option value="">All projects</option
					>{#each projects.current.filter((project) => project.deleted_at === null) as project (project.id)}<option
							value={project.id}>{project.name}</option
						>{/each}</select
				>
				<select
					aria-label="Place"
					value={placeId}
					onchange={(event) => updateFilter('place', event.currentTarget.value)}
					><option value="">All places</option
					>{#each data.current.places.filter((place) => place.deleted_at === null) as place (place.id)}<option
							value={place.id}>{place.name}</option
						>{/each}</select
				>
				<label
					>From<input
						aria-label="From"
						type="datetime-local"
						value={from}
						onchange={(event) => updateFilter('from', event.currentTarget.value)}
					/></label
				>
				<label
					>To<input
						aria-label="To"
						type="datetime-local"
						value={to}
						onchange={(event) => updateFilter('to', event.currentTarget.value)}
					/></label
				>
			</div>
		</div>
		{#if filtered}
			<h1 class="results-title">Search results</h1>
			<div class="result-summary">
				{searchResult.sessions.length}
				{searchResult.sessions.length === 1 ? 'session' : 'sessions'}, {formatMinutes(
					searchResult.minutes,
					data.current.durationFormat,
				)}
				<Button variant="quiet" size="sm" onclick={clearFilters}>Clear</Button>
			</div>
			{#if searchResult.sessions.length === 0}
				<p class="empty-results">No sessions found. Change your search or clear the filters.</p>
			{:else if desktop}<div class="results-table">
					<table>
						<thead
							><tr
								><th>Date</th><th>Time</th><th>Work item</th><th>Type</th><th>Place</th><th
									>Duration</th
								><th>Note</th></tr
							></thead
						><tbody
							>{#each searchResult.sessions as session (session.id)}{@const item =
									data.current.items.find(
										(entry) => entry.id === session.work_item_id,
									)}{@const type = data.current.types.find(
									(entry) => entry.id === session.type_id,
								)}{@const place = data.current.places.find(
									(entry) => entry.id === (session.place_id ?? item?.place_id),
								)}<tr
									class:selected={session.id === selectedId}
									tabindex="0"
									onclick={() => selectSession(session.id)}
									onkeydown={(event) => {
										if (event.key === 'Enter' || event.key === ' ') selectSession(session.id);
									}}
									><td
										><button class="result-button" onclick={() => selectSession(session.id)}
											>{new Intl.DateTimeFormat(undefined, {
												dateStyle: 'medium',
												timeZone: data.current.zone,
											}).format(session.start_at)}</button
										></td
									><td
										>{new Intl.DateTimeFormat(undefined, {
											hour: 'numeric',
											minute: '2-digit',
										}).format(session.start_at)}</td
									><td><MatchText text={item?.name ?? 'Untitled session'} {query} /></td><td
										>{type?.name ?? 'Work'}</td
									><td
										>{#if place}<MatchText text={place.name} {query} />{/if}</td
									><td
										>{formatMinutes(
											Math.round(((session.end_at ?? now) - session.start_at) / 60000),
											data.current.durationFormat,
										)}</td
									><td><MatchText text={session.note.split('\n')[0] ?? ''} {query} /></td></tr
								>{/each}</tbody
						>
					</table>
				</div>
			{:else}<SearchRows
					sessions={searchResult.sessions}
					items={data.current.items}
					format={data.current.durationFormat}
					types={data.current.types}
					places={data.current.places}
					{query}
					{now}
					onselect={selectSession}
				/>
			{/if}
		{:else}
			<header>
				<h1>{dayTitle}</h1>
				<nav aria-label="History day navigation">
					<Button variant="secondary" size="sm" onclick={() => selectDay(addDays(selectedDay, -1))}
						>Previous day</Button
					>
					{#if !isToday}<Button variant="quiet" size="sm" onclick={() => selectDay(today)}
							>Today</Button
						>{/if}
					<Button
						variant="secondary"
						size="sm"
						disabled={isToday}
						onclick={() => selectDay(addDays(selectedDay, 1))}>Next day</Button
					>
				</nav>
				{#if dayOpenIssues > 0}<Button
						variant="secondary"
						size="sm"
						onclick={() => goto(resolve(`/history/review?day=${selectedDay}`))}
						>Review {dayOpenIssues}</Button
					>{/if}
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
				onselect={selectSession}
			/>
			<p class="totals">
				{shortDuration(model.totals.work)} work, {shortDuration(model.totals.other)} other
			</p>
			{#if rows.some((row) => row.kind === 'session')}
				<TrailList {rows} onselect={selectSession} onaddgap={addGap} />
			{:else}
				<EmptyState
					message="No sessions on this day."
					actionLabel="Add session"
					onaction={addEmptySession}
				/>
			{/if}
		{/if}
	</div>
	{#if desktop}<aside
			id="history-editor"
			tabindex="-1"
			class="editor-pane"
			aria-label="Session editor"
		>
			{#if selectedId}
				<div class="editor-heading">
					<h2>Edit session</h2>
					<Button variant="quiet" size="sm" onclick={clearSelectedSession}>Close</Button>
				</div>
				<SessionEditor
					request={{ mode: 'edit', sessionId: selectedId }}
					onclose={clearSelectedSession}
				/>
			{:else}<p>Select a session to see its details.</p>{/if}
		</aside>{/if}
</section>

<style>
	.history {
		position: relative;
		display: grid;

		/* minmax(0, 1fr): never let a wide child widen the page past the gutter. */
		grid-template-columns: minmax(0, 1fr);
		gap: var(--ht-space-4);
	}

	.results-title {
		margin: 0;
		font: var(--ht-type-title);
	}

	.skip-editor {
		position: absolute;
		inset-block-start: 0;
		inset-inline-start: 0;
		transform: translateY(-200%);
		padding: var(--ht-space-2) var(--ht-space-3);
		border-radius: var(--ht-radius-control);
		background: var(--ht-paper);
		color: var(--ht-ink);
	}

	.skip-editor:focus {
		transform: translateY(0);
	}

	.two-pane {
		grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr);
		align-items: start;
	}

	.left-pane {
		min-width: 0;
		display: grid;
		gap: var(--ht-space-4);
	}

	.editor-pane {
		position: sticky;
		top: var(--ht-space-4);
		min-width: 0;
		max-height: calc(100vh - var(--ht-space-8));
		overflow: auto;
		border-inline-start: var(--ht-hairline) solid var(--ht-line);
		padding-inline-start: var(--ht-space-4);
	}

	.editor-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--ht-space-2);
	}

	.editor-heading h2 {
		margin: 0;
		font: var(--ht-type-title);
	}

	.search-controls {
		display: grid;
		gap: var(--ht-space-2);
	}

	.search-label,
	.filters label {
		display: grid;
		gap: var(--ht-space-1);
		font: var(--ht-type-label);
		color: var(--ht-ink-2);
	}

	.search-label input,
	.filters select,
	.filters input {
		min-height: var(--ht-control-height);
		border: var(--ht-hairline) solid var(--ht-line-strong);
		border-radius: var(--ht-radius-control);
		padding: var(--ht-space-2) var(--ht-space-3);
		background: var(--ht-surface);
		color: var(--ht-ink);
		font: var(--ht-type-body);
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--ht-space-2);
	}

	.filters > :global(button),
	.presets :global(button) {
		min-height: var(--ht-control-height);
	}

	.result-summary {
		display: flex;
		align-items: center;
		gap: var(--ht-space-2);
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	.empty-results {
		padding-block: var(--ht-space-5);
		color: var(--ht-ink-2);
	}

	.results-table {
		overflow-x: auto;
	}

	.results-table table {
		width: 100%;
		border-collapse: collapse;
		font: var(--ht-type-label);
	}

	.results-table th,
	.results-table td {
		text-align: start;
		padding: var(--ht-space-2);
		border-bottom: var(--ht-hairline) solid var(--ht-line);
	}

	.results-table th {
		color: var(--ht-ink-2);
	}

	.results-table tr.selected {
		background: var(--ht-sunken);
	}

	.result-button {
		border: 0;
		background: none;
		color: var(--ht-ink);
		text-decoration: underline;
		text-decoration-color: var(--ht-ink);
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
