<script lang="ts">
	import {
		dayBounds,
		dayOf,
		readSetting,
		WORK_TYPE_ID,
		DEFAULT_ACTIVITY_TYPES,
	} from '@hourtrail/core';
	import type { RecordOf } from '@hourtrail/core';
	import {
		Banner,
		Button,
		DayRibbon,
		Field,
		RunningPanel,
		Sheet,
		TextInput,
		TypeTag,
		WorkItemRow,
		showToast,
	} from '$lib/components';
	import { db, repo } from '$lib/db/app';
	import { live } from '$lib/live.svelte';
	import { requestPersistence } from '$lib/pwa/persist';
	import { openSessionEditor } from '$lib/features/session/editor.svelte';
	import { selectRecentItems, todayRibbonSegments, todayTotals } from '$lib/features/home/domain';
	import { formatClock } from '$lib/components/trail';

	type Session = RecordOf<'session'>;
	type WorkItem = RecordOf<'work_item'>;
	type ActivityType = RecordOf<'activity_type'>;

	const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const today = live(
		async () => {
			const stored = await db.setting.get('reporting_tz');
			const reportingZone = readSetting('reporting_tz', stored?.value) ?? deviceZone;
			const [sessions, types, items, places] = await Promise.all([
				db.session.filter((row) => row.deleted_at === null).toArray(),
				db.activity_type.filter((row) => row.deleted_at === null).toArray(),
				db.work_item.filter((row) => row.deleted_at === null).toArray(),
				db.place.filter((row) => row.deleted_at === null).toArray(),
			]);
			return { sessions, types, items, places, reportingZone };
		},
		{ sessions: [], types: [], items: [], places: [], reportingZone: deviceZone },
	);
	const running = live(() => repo.running(), [] as Session[]);
	let runningSnapshot = $state<Session[]>([]);
	let refreshedItems = $state<WorkItem[]>([]);
	let refreshedSessions = $state<Session[]>([]);
	let sessionNames = $state<Record<string, string>>({});
	let now = $state(Date.now());
	let busy = $state(false);
	let search = $state('');
	let sheet = $state<'items' | 'types' | null>(null);
	let sheetQuery = $state('');
	let persistenceAsked = $state(false);
	const currentDay = $derived(dayOf(now, today.current.reportingZone));
	const bounds = $derived(dayBounds(currentDay, today.current.reportingZone));
	const allSessions = $derived([
		...new Map(
			[...today.current.sessions, ...refreshedSessions].map((session) => [session.id, session]),
		).values(),
	]);
	const daySessions = $derived(
		allSessions.filter((session) => {
			const end = session.end_at ?? now;
			return end > bounds.start && session.start_at < bounds.end;
		}),
	);
	const totals = $derived(
		todayTotals(daySessions, today.current.types, currentDay, today.current.reportingZone, now),
	);
	const allItems = $derived([
		...new Map([...today.current.items, ...refreshedItems].map((item) => [item.id, item])).values(),
	]);
	const pinned = $derived(
		allItems
			.filter(
				(item) => item.deleted_at === null && item.archived_at === null && item.pinned_at !== null,
			)
			.sort((a, b) => a.pin_sort - b.pin_sort),
	);
	// Recent leaves out pinned items and the item already running on the panel.
	const recent = $derived(
		selectRecentItems(
			allItems,
			allSessions,
			new Set([
				...pinned.map((item) => item.id),
				...(running.current.length ? running.current : runningSnapshot)
					.map((session) => session.work_item_id)
					.filter((id): id is string => id !== null),
			]),
		),
	);
	const filtered = $derived(
		allItems.filter(
			(item) =>
				item.deleted_at === null &&
				item.archived_at === null &&
				item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
		),
	);
	const current = $derived(
		(running.current.length ? running.current : runningSnapshot).at(-1) ?? null,
	);
	const currentItem = $derived(
		current
			? (allItems.find((item) => item.id === current.work_item_id) ??
					(sessionNames[current.id] ? ({ name: sessionNames[current.id] } as WorkItem) : undefined))
			: undefined,
	);
	const currentType = $derived(
		current
			? (today.current.types.find((type) => type.id === current.type_id) ??
					DEFAULT_ACTIVITY_TYPES.find((type) => type.id === current.type_id))
			: undefined,
	);
	const currentPlace = $derived(
		current?.place_id
			? today.current.places.find((place) => place.id === current.place_id)?.name
			: undefined,
	);
	const ribbon = $derived(
		todayRibbonSegments(
			daySessions,
			today.current.items,
			today.current.types,
			today.current.reportingZone,
			currentDay,
			now,
		),
	);
	const ticks = $derived([
		{ at: bounds.start, label: '12a' },
		{ at: bounds.start + 6 * 60 * 60_000, label: '6a' },
		{ at: bounds.start + 12 * 60 * 60_000, label: '12p' },
		{ at: bounds.start + 18 * 60 * 60_000, label: '6p' },
	]);

	$effect(() => {
		const refresh = () => (now = Date.now());
		const id = setInterval(refresh, 1000);
		document.addEventListener('visibilitychange', refresh);
		window.addEventListener('pageshow', refresh);
		void repo.ensureSeeded();
		void repo.running().then((rows) => (runningSnapshot = rows));
		return () => {
			clearInterval(id);
			document.removeEventListener('visibilitychange', refresh);
			window.removeEventListener('pageshow', refresh);
		};
	});

	function duration(minutes: number) {
		const hours = Math.floor(minutes / 60);
		const rest = minutes % 60;
		return `${hours ? `${hours}h ` : ''}${String(rest).padStart(hours ? 2 : 1, '0')}m`;
	}
	async function refreshHome() {
		const [rows, items, sessions] = await Promise.all([
			repo.running(),
			db.work_item.filter((item) => item.deleted_at === null).toArray(),
			db.session.filter((session) => session.deleted_at === null).toArray(),
		]);
		runningSnapshot = rows;
		refreshedItems = items;
		refreshedSessions = sessions;
	}
	async function announceFirstSession() {
		if (persistenceAsked) return;
		if (await db.local.get('home_persistence_asked' as never)) {
			persistenceAsked = true;
			return;
		}
		persistenceAsked = true;
		void db.local.put({ key: 'home_persistence_asked' as never, value: true });
		void requestPersistence();
	}
	async function startItem(id: string | null) {
		if (busy) return;
		busy = true;
		try {
			if (current) {
				const result = await repo.switchTo({ workItemId: id });
				await refreshHome();
				await announceFirstSession();
				showToast({
					message: `Switched at ${formatClock(result.started.start_at)}.`,
					undo: () => repo.undo(result.undo),
				});
			} else {
				const result = await repo.start({ workItemId: id });
				await refreshHome();
				if (!result.alreadyRunning) await announceFirstSession();
			}
			search = '';
			sheet = null;
		} finally {
			busy = false;
		}
	}
	async function startNamed(name: string) {
		if (busy || !name.trim()) return;
		busy = true;
		try {
			const normalized = name.trim();
			if (current) {
				let item = await db.work_item
					.where('name')
					.equals(normalized)
					.filter((row) => row.archived_at === null && row.deleted_at === null)
					.first();
				item ??= await repo.create('work_item', {
					name: normalized,
					description: '',
					type_id: WORK_TYPE_ID,
					project_id: null,
					place_id: null,
					pinned_at: null,
					pin_sort: 0,
					archived_at: null,
				});
				await repo.update('session', current.id, { work_item_id: item.id });
				sessionNames = { ...sessionNames, [current.id]: item.name };
				await refreshHome();
			} else {
				const result = await repo.startNamed(normalized);
				sessionNames = { ...sessionNames, [result.session.id]: result.workItem.name };
				await refreshHome();
				await announceFirstSession();
				showToast({ message: `${normalized} started.`, undo: () => repo.undo(result.undo) });
			}
			search = '';
			sheet = null;
		} finally {
			busy = false;
		}
	}
	async function stop() {
		if (busy) return;
		busy = true;
		try {
			const result = await repo.stop();
			if (!result) return;
			await refreshHome();
			const elapsed = Math.max(
				0,
				Math.round((result.session.end_at! - result.session.start_at) / 60_000),
			);
			showToast({
				message: `Stopped at ${formatClock(result.session.end_at!)}. ${duration(elapsed)}`,
				undo: async () => {
					await repo.undo(result.undo);
					runningSnapshot = await repo.running();
				},
				action: {
					label: 'Add note',
					run: () => openSessionEditor(result.session.id, { focus: 'note' }),
				},
			});
		} finally {
			busy = false;
		}
	}
	async function chooseType(type: ActivityType) {
		if (current) await repo.update('session', current.id, { type_id: type.id });
		sheet = null;
	}
	function itemName(item: WorkItem) {
		window.location.assign(`/items/${encodeURIComponent(item.id)}`);
	}
	function exactMatch() {
		return filtered.find((item) => item.name === search.trim());
	}
</script>

<svelte:head><title>Today · Hourtrail</title></svelte:head>
<h1>
	{new Intl.DateTimeFormat(undefined, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
	}).format(now)}
</h1>

<div class="home-grid">
	<section class="summary" aria-label="Today">
		{#if running.current.length > 1}<Banner
				tone="caution"
				message="Two sessions are running."
			/>{/if}
		{#if current && currentType}
			<RunningPanel
				typeName={currentType.name}
				typeColor={currentType.color}
				workItemName={currentItem?.name ?? null}
				{busy}
				startAt={current.start_at}
				placeName={currentPlace}
				{now}
				onstop={stop}
				onswitch={() => (sheet = 'items')}
				onname={startNamed}
				ontypeclick={() => (sheet = 'types')}
				onnameclick={() => (sheet = 'items')}
			/>
		{:else}
			<p class="status">Not tracking</p>
			<Button variant="primary" size="lg" wide {busy} onclick={() => startItem(null)}>Start</Button>
			<Field label="Search or name a work item">
				{#snippet children({ id, describedBy, invalid })}
					<form
						onsubmit={(event) => {
							event.preventDefault();
							void startNamed(search);
						}}
					>
						<TextInput
							bind:value={search}
							{id}
							{describedBy}
							{invalid}
							placeholder="Search or name a work item"
						/>
					</form>
				{/snippet}
			</Field>
			{#if search && !exactMatch()}<Button variant="secondary" onclick={() => startNamed(search)}
					>Start “{search.trim()}”</Button
				>{/if}
			{#if search}<ul class="matches">
					{#each filtered as item (item.id)}<li>
							<button onclick={() => startItem(item.id)}>{item.name}</button>
						</li>{/each}
				</ul>{/if}
		{/if}
		<section class="today-summary">
			<h2>Today</h2>
			<p>
				{duration(totals.work)} work{#if totals.other > 0}, {duration(totals.other)} other{/if}
			</p>
			<DayRibbon
				dayStart={bounds.start}
				dayEnd={bounds.end}
				segments={ribbon}
				{ticks}
				{now}
				onselect={(id) => openSessionEditor(id)}
			/>
		</section>
	</section>
	<aside class="item-lists">
		{#if pinned.length}<section>
				<h2>Pinned</h2>
				{#each pinned as item (item.id)}{@const type =
						today.current.types.find((row) => row.id === item.type_id) ??
						DEFAULT_ACTIVITY_TYPES.find((row) => row.id === item.type_id)}{#if type}<WorkItemRow
							name={item.name}
							typeName={type.name}
							typeColor={type.color}
							pinned
							disabled={busy}
							onstart={() => startItem(item.id)}
							onopen={() => itemName(item)}
						/>{/if}{/each}
			</section>{/if}
		{#if recent.length}<section>
				<h2>Recent</h2>
				{#each recent as item (item.id)}{@const type =
						today.current.types.find((row) => row.id === item.type_id) ??
						DEFAULT_ACTIVITY_TYPES.find((row) => row.id === item.type_id)}{#if type}<WorkItemRow
							name={item.name}
							typeName={type.name}
							typeColor={type.color}
							disabled={busy}
							onstart={() => startItem(item.id)}
							onopen={() => itemName(item)}
						/>{/if}{/each}
			</section>{/if}
	</aside>
</div>

<Sheet
	open={sheet !== null}
	title={sheet === 'types' ? 'Choose a type' : 'Switch activity'}
	onclose={() => (sheet = null)}
>
	{#if sheet === 'types'}
		{#each today.current.types.filter((type) => type.archived_at === null) as type (type.id)}<button
				class="choice"
				onclick={() => chooseType(type)}><TypeTag name={type.name} color={type.color} /></button
			>{/each}
	{:else}
		<Button variant="secondary" onclick={() => startItem(null)}>Untitled session</Button>
		<Field label="Search items"
			>{#snippet children({ id, describedBy, invalid })}<TextInput
					bind:value={sheetQuery}
					{id}
					{describedBy}
					{invalid}
				/>{/snippet}</Field
		>
		{#each today.current.items.filter((item) => item.archived_at === null && item.deleted_at === null && item.name
					.toLowerCase()
					.includes(sheetQuery.toLowerCase())) as item (item.id)}<button
				class="choice"
				onclick={() => startItem(item.id)}>{item.name}</button
			>{/each}
	{/if}
</Sheet>

<style>
	.status {
		font: var(--ht-type-body-strong);
		color: var(--ht-ink-2);
	}

	.home-grid {
		display: grid;
		gap: var(--ht-space-6);
	}

	.summary,
	.item-lists,
	.today-summary {
		display: grid;
		gap: var(--ht-space-4);
		min-width: 0;
	}

	.today-summary {
		padding-top: var(--ht-space-4);
		border-top: var(--ht-hairline) solid var(--ht-line);
	}

	h2 {
		font: var(--ht-type-heading);
	}

	.today-summary p {
		font: var(--ht-type-body-strong);
	}

	.item-lists section {
		display: grid;
		gap: var(--ht-space-2);
	}

	.matches {
		display: grid;
		gap: var(--ht-space-1);
		list-style: none;
	}

	.matches button,
	.choice {
		width: 100%;
		min-height: var(--ht-target);
		text-align: start;
		padding: var(--ht-space-3);
		border: 0;
		border-radius: var(--ht-radius-control);
		background: transparent;
		color: var(--ht-ink);
	}

	@media (width >= 1024px) {
		.home-grid {
			grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr);
			align-items: start;
			gap: var(--ht-space-6);
		}
	}
</style>
