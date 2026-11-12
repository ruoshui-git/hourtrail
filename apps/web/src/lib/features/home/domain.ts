import { DEFAULT_ACTIVITY_TYPES, splitByDay } from '@hourtrail/core';
import type { BlazeKey, RecordOf } from '@hourtrail/core';

type Session = RecordOf<'session'>;
type WorkItem = RecordOf<'work_item'>;
type ActivityType = RecordOf<'activity_type'>;

export type RunningResolution = {
	kind: 'stop-at-later-start' | 'stop-now' | 'keep-both' | 'stop-all-but-latest';
	label: string;
	targetIds: string[];
	endAt?: number;
	endTz?: string | null;
};

const clockTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** Labels name the session and its start time, so two sessions of one item stay distinguishable. */
export function runningResolutionChoices(
	sessions: Session[],
	itemNames: Map<string, string>,
	formatTime: (ms: number) => string = (ms) => clockTime.format(ms),
): RunningResolution[] {
	if (sessions.length < 2) return [];
	const ordered = [...sessions].sort((a, b) => a.start_at - b.start_at);
	const latest = ordered.at(-1)!;
	const older = ordered.slice(0, -1);
	if (sessions.length > 2) {
		return [
			{
				kind: 'stop-all-but-latest',
				label: 'Stop all but the latest',
				targetIds: older.map((session) => session.id),
				endAt: latest.start_at,
				endTz: latest.start_tz,
			},
		];
	}
	const earlier = ordered[0]!;
	const name = (session: Session) =>
		itemNames.get(session.work_item_id ?? '') ?? 'Untitled session';
	return [
		{
			kind: 'stop-at-later-start',
			label: `Stop ${name(earlier)} (from ${formatTime(earlier.start_at)}) at ${formatTime(latest.start_at)}`,
			targetIds: [earlier.id],
			endAt: latest.start_at,
			endTz: latest.start_tz,
		},
		{
			kind: 'stop-now',
			label: `Stop ${name(earlier)} (from ${formatTime(earlier.start_at)}) now`,
			targetIds: [earlier.id],
		},
		{ kind: 'keep-both', label: 'Keep both', targetIds: ordered.map((session) => session.id) },
	];
}

export function runningPairKey(sessions: Session[]): string {
	return [...sessions]
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((session) => `${session.id}:${session.rev}:${session.updated_at}`)
		.join('|');
}

export function selectRecentItems(
	items: WorkItem[],
	sessions: Session[],
	excludedIds: Set<string>,
): WorkItem[] {
	const latest = new Map<string, number>();
	for (const session of sessions) {
		if (session.deleted_at === null && session.work_item_id) {
			latest.set(
				session.work_item_id,
				Math.max(latest.get(session.work_item_id) ?? -Infinity, session.start_at),
			);
		}
	}
	return items
		.filter((item) => !item.archived_at && !item.deleted_at && !excludedIds.has(item.id))
		.filter((item) => latest.has(item.id))
		.sort((a, b) => latest.get(b.id)! - latest.get(a.id)!)
		.slice(0, 6);
}

export function todayTotals(
	sessions: Session[],
	types: ActivityType[],
	day: string,
	tz: string,
	now: number,
): { work: number; other: number } {
	const typeById = new Map(DEFAULT_ACTIVITY_TYPES.map((type) => [type.id, type]));
	for (const type of types) typeById.set(type.id, type);
	const workTypeIds = new Set(
		[...typeById.values()].filter((type) => type.counts_as_work).map((type) => type.id),
	);
	let work = 0;
	let other = 0;
	for (const session of sessions) {
		for (const slice of splitByDay(session, tz, now)) {
			if (slice.day !== day) continue;
			if (workTypeIds.has(session.type_id)) work += slice.minutes;
			else other += slice.minutes;
		}
	}
	return { work, other };
}

const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function todayRibbonSegments(
	sessions: Session[],
	items: WorkItem[],
	types: ActivityType[],
	tz: string,
	day: string,
	now: number,
): { id: string; start: number; end: number | null; color: BlazeKey; label: string }[] {
	const itemNames = new Map(items.map((item) => [item.id, item.name]));
	const typeColors = new Map(types.map((type) => [type.id, type.color]));
	return sessions.flatMap((session) =>
		splitByDay(session, tz, now)
			.filter((slice) => slice.day === day)
			.map((slice) => ({
				id: session.id,
				start: slice.start,
				end: session.end_at === null ? null : slice.end,
				color: typeColors.get(session.type_id) ?? 'lake',
				// A segment is a button: name what and when, e.g. "修复洗手台, 9:15 AM to now".
				label: `${itemNames.get(session.work_item_id ?? '') ?? 'Untitled session'}, ${clock.format(
					session.start_at,
				)} to ${session.end_at === null ? 'now' : clock.format(session.end_at)}`,
			})),
	);
}
