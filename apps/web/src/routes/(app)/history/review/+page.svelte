<script lang="ts">
	import {
		addDays,
		dayBounds,
		dayOf,
		openIssueCount,
		readSetting,
		review,
		reviewMarkId,
	} from '@hourtrail/core';
	import type { RecordOf, ReviewIssue } from '@hourtrail/core';
	import { page } from '$app/state';
	import { formatMinutes } from '$lib/format';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		Banner,
		Button,
		DayRibbon,
		EmptyState,
		ReviewItem,
		TrailList,
		showToast,
	} from '$lib/components';
	import { db, repo } from '$lib/db/app';
	import { live } from '$lib/live.svelte';
	import { openNewSession, openSessionEditor } from '$lib/features/session/editor.svelte';
	import { buildDay } from '$lib/features/history/domain';
	import { conflictWording, groupReviewIssues, reviewFixLabel } from '$lib/features/review/domain';

	const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(timer);
	});
	const data = live(
		async () => {
			const [sessions, items, types, places, conflicts, marks, settings, dayReview] =
				await Promise.all([
					db.session.toArray(),
					db.work_item.toArray(),
					db.activity_type.toArray(),
					db.place.toArray(),
					db.conflict.toArray(),
					db.review_mark.toArray(),
					db.setting.toArray(),
					db.day_review.get(page.url.searchParams.get('day') ?? ''),
				]);
			const value = (key: string) => settings.find((setting) => setting.id === key)?.value;
			return {
				sessions,
				items,
				types,
				places,
				conflicts,
				marks,
				dayReview,
				zone: readSetting('reporting_tz', value('reporting_tz')) ?? deviceZone,
				longGap: readSetting('long_gap_min', value('long_gap_min')) ?? 60,
				longSession: readSetting('long_session_min', value('long_session_min')) ?? 600,
				notePrompt: readSetting('note_prompt', value('note_prompt')) ?? 'work',
			};
		},
		{
			sessions: [],
			items: [],
			types: [],
			places: [],
			conflicts: [],
			marks: [],
			dayReview: undefined,
			zone: deviceZone,
			longGap: 60,
			longSession: 600,
			notePrompt: 'work' as const,
		},
	);
	const requestedDay = $derived(page.url.searchParams.get('day'));
	const defaultDay = $derived(addDays(dayOf(now, data.current.zone), -1));
	const day = $derived(
		requestedDay && validDay(requestedDay, data.current.zone) ? requestedDay : defaultDay,
	);
	const issues = $derived(
		review(day, {
			sessions: data.current.sessions,
			items: data.current.items,
			types: data.current.types,
			places: data.current.places,
			conflicts: data.current.conflicts,
			marks: data.current.marks,
			settings: {
				long_gap_min: data.current.longGap,
				long_session_min: data.current.longSession,
				note_prompt: data.current.notePrompt,
			},
			tz: data.current.zone,
			now,
			formatTime: (instant: number) =>
				new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(instant),
		}),
	);
	const groups = $derived(groupReviewIssues(issues));
	const trail = $derived(
		buildDay(
			day,
			data.current.zone,
			data.current.sessions.filter((session) => session.deleted_at === null),
			data.current.items.filter((item) => item.deleted_at === null),
			data.current.types.filter((type) => type.deleted_at === null),
			data.current.places.filter((place) => place.deleted_at === null),
			{ long_gap_min: data.current.longGap },
			now,
		),
	);
	const title = $derived(
		new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(
			new Date(`${day}T12:00:00`),
		),
	);

	function validDay(value: string, zone: string): boolean {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
		try {
			dayBounds(value, zone);
			return true;
		} catch {
			return false;
		}
	}
	function selectSession(id: string) {
		openSessionEditor(id);
	}
	function addGap(start: number, end: number) {
		openNewSession({ start_at: start, end_at: end });
	}
	function detailedMessage(issue: ReviewIssue): string {
		if (issue.kind === 'overlap') {
			const otherId = issue.session_ids.find((id) => id !== issue.session_ids[0]);
			const other = data.current.sessions.find((session) => session.id === otherId);
			const item = data.current.items.find((entry) => entry.id === other?.work_item_id);
			if (item)
				return `Overlaps ${item.name} by ${issue.message.replace('Sessions overlap by ', '')}`;
		}
		return issue.message;
	}
	function conflict(issue: ReviewIssue): RecordOf<'conflict'> | undefined {
		return data.current.conflicts.find((record) => `conflict:${record.id}` === issue.key);
	}
	const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
	/** Names the session a single-session issue is about, e.g. "修复洗手台, 3:00–4:00 PM". */
	function sessionDetail(issue: ReviewIssue): string | undefined {
		if (!['no-note', 'place', 'suspect-time', 'running-long'].includes(issue.kind))
			return undefined;
		const session = data.current.sessions.find((entry) => entry.id === issue.session_ids[0]);
		if (!session) return undefined;
		const item = data.current.items.find((entry) => entry.id === session.work_item_id);
		const end = session.end_at === null ? 'now' : clock.format(session.end_at);
		return `${item?.name ?? 'Untitled session'}, ${clock.format(session.start_at)}–${end}`;
	}
	function conflictDetail(issue: ReviewIssue): string | undefined {
		const record = conflict(issue);
		if (!record) return sessionDetail(issue);
		return conflictWording(record.field, record.kept_value, record.other_value, (field, value) => {
			if ((field === 'end_at' || field === 'start_at') && typeof value === 'number') {
				return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
					value,
				);
			}
			return String(value ?? 'empty');
		});
	}
	async function mark(issue: ReviewIssue, state: 'reviewed' | 'dismissed') {
		const id = reviewMarkId(day, issue.key);
		const existing = data.current.marks.find((row) => row.id === id);
		if (existing) {
			const previous = existing.state;
			if (existing.deleted_at !== null) await repo.restore('review_mark', id);
			await repo.update('review_mark', id, { state });
			showToast({
				message: state === 'reviewed' ? 'Marked reviewed.' : 'Dismissed.',
				undo: () => repo.update('review_mark', id, { state: previous }),
			});
		} else {
			await repo.create('review_mark', { id, day, issue_key: issue.key, state });
			showToast({
				message: state === 'reviewed' ? 'Marked reviewed.' : 'Dismissed.',
				undo: async () => {
					await repo.remove('review_mark', id);
				},
			});
		}
	}
	async function resolveConflict(issue: ReviewIssue, useOther: boolean) {
		const record = conflict(issue);
		const session = data.current.sessions.find((row) => row.id === record?.record_id);
		if (!record || !session) return;
		const changes: {
			entity: 'session' | 'conflict';
			id: string;
			changes: Record<string, unknown>;
		}[] = [];
		if (useOther)
			changes.push({
				entity: 'session',
				id: session.id,
				changes: { [record.field]: record.other_value },
			});
		changes.push({ entity: 'conflict', id: record.id, changes: { resolved_at: Date.now() } });
		const undo = await repo.editMany('Resolve conflict', changes);
		showToast({
			message: useOther ? 'Used the other value.' : 'Kept the current value.',
			undo: () => repo.undo(undo),
		});
	}
	function actions(issue: ReviewIssue): { label: string; onclick: () => void }[] {
		if (issue.kind === 'conflict')
			return [
				{ label: 'Keep current value', onclick: () => void resolveConflict(issue, false) },
				{ label: 'Use other value', onclick: () => void resolveConflict(issue, true) },
			];
		if (issue.kind === 'two-running')
			return [
				{
					label: 'Resolve on Home',
					onclick: () => {
						window.location.assign('/');
					},
				},
			];
		if (issue.kind === 'gap' && issue.start !== undefined && issue.end !== undefined)
			return [{ label: 'Add session', onclick: () => addGap(issue.start!, issue.end!) }];
		const label = reviewFixLabel(issue.kind);
		if (!label || !issue.session_ids[0]) return [];
		return [
			{
				label,
				onclick: () =>
					openSessionEditor(
						issue.session_ids[0]!,
						issue.kind === 'no-note' ? { focus: 'note' } : {},
					),
			},
		];
	}
	async function finish() {
		const existing = await db.day_review.get(day);
		if (existing) await repo.update('day_review', day, { finished_at: Date.now() });
		else await repo.create('day_review', { id: day, finished_at: Date.now() });
		const remaining = openIssueCount(issues);
		showToast({
			message: remaining ? `Review finished. ${remaining} things left open.` : 'Review finished.',
		});
	}
</script>

<svelte:head><title>Review {title} · Hourtrail</title></svelte:head>
<section class="review-screen">
	<header>
		<div>
			<Button variant="quiet" size="sm" onclick={() => goto(resolve(`/history?day=${day}`))}
				>History</Button
			>
			<h1>{title}</h1>
		</div>
		<nav aria-label="Review day navigation">
			<Button
				variant="secondary"
				size="sm"
				onclick={() => goto(resolve(`/history/review?day=${addDays(day, -1)}`))}
				>Previous day</Button
			>
			<Button
				variant="secondary"
				size="sm"
				onclick={() => goto(resolve(`/history/review?day=${addDays(day, 1)}`))}>Next day</Button
			>
		</nav>
	</header>
	<DayRibbon
		dayStart={trail.dayStart}
		dayEnd={trail.dayEnd}
		segments={trail.segments}
		ticks={trail.ticks}
		{now}
		onselect={selectSession}
	/>
	<p class="totals">
		{formatMinutes(trail.totals.work)} work, {formatMinutes(trail.totals.other)} other
	</p>
	{#if trail.rows.some((row) => row.kind === 'session')}<TrailList
			rows={trail.rows}
			onselect={selectSession}
			onaddgap={(gap) => addGap(gap.start, gap.end)}
		/>
	{:else}<EmptyState
			message="No sessions on this day."
			actionLabel="Add session"
			onaction={() => addGap(trail.dayStart + 9 * 3_600_000, trail.dayStart + 10 * 3_600_000)}
		/>{/if}
	<section aria-labelledby="issues-heading">
		<h2 id="issues-heading">Things to check</h2>
		{#if groups.open.length}{#each groups.open as issue (issue.key)}
				<ReviewItem
					tone={issue.severity}
					message={detailedMessage(issue)}
					detail={conflictDetail(issue)}
					actions={actions(issue)}
					onreviewed={() => void mark(issue, 'reviewed')}
					ondismiss={() => void mark(issue, 'dismissed')}
				/>
			{/each}{:else}<Banner message="No open issues for this day." />{/if}
		{#if groups.done.length}<details>
				<summary>Done ({groups.done.length})</summary>{#each groups.done as issue (issue.key)}
					<ReviewItem
						tone={issue.severity}
						message={detailedMessage(issue)}
						detail={conflictDetail(issue)}
						state={issue.state}
						actions={[]}
						onreviewed={() => void repo.remove('review_mark', reviewMarkId(day, issue.key))}
						ondismiss={() => void repo.remove('review_mark', reviewMarkId(day, issue.key))}
					/>
					<Button
						variant="quiet"
						size="sm"
						onclick={() => void repo.remove('review_mark', reviewMarkId(day, issue.key))}
						>Undo</Button
					>
				{/each}
			</details>{/if}
	</section>
	<Button variant="primary" wide onclick={() => void finish()}>Finish review</Button>
</section>

<style>
	.review-screen {
		display: grid;
		gap: var(--ht-space-4);
		max-width: var(--ht-content-max);
		margin-inline: auto;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--ht-space-3);
		flex-wrap: wrap;
	}

	header h1 {
		margin: var(--ht-space-1) 0 0;
		font: var(--ht-type-title);
	}

	header nav {
		display: flex;
		gap: var(--ht-space-2);
	}

	.totals {
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	section > h2 {
		font: var(--ht-type-heading);
	}

	details summary {
		min-height: var(--ht-target);
		display: flex;
		align-items: center;
		cursor: pointer;
		font: var(--ht-type-body-strong);
	}
</style>
