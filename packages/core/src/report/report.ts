import type { Day } from '../time';
import { reportConfigSchema } from './config';
import type { ReportConfig } from './config';
import {
	collectEntries,
	dayRange,
	dimensionOf,
	groupBy,
	readingZone,
	tally,
	toRow,
} from './entries';
import type { Entry, ReportData, ReportRow, Tally } from './entries';

export type { ReportData, ReportRow } from './entries';

export type DayTotal = Tally & { day: Day };

export type ReportGroup = {
	key: string;
	label: string;
	minutes: number;
	work_minutes: number;
	other_minutes: number;
	/** Session slices in this group; null when show_sessions is off. */
	rows: ReportRow[] | null;
};

export type Report = {
	title: string;
	range: { from: Day; to: Day };
	total_minutes: number;
	work_minutes: number;
	other_minutes: { type_id: string; name: string; minutes: number }[];
	groups: ReportGroup[];
	/** One entry per calendar day in the range, zero days included, for the bar chart. */
	days: DayTotal[];
	/** One row per session slice in the range. */
	rows: ReportRow[];
};

type GroupBy = ReportConfig['group_by'];

function sortGroups(groups: ReportGroup[], by: GroupBy): ReportGroup[] {
	return groups.sort((a, b) => {
		if (by === 'day') return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
		return (
			b.minutes - a.minutes ||
			(a.label < b.label ? -1 : a.label > b.label ? 1 : 0) ||
			(a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
		);
	});
}

/**
 * Totals, groups, per-day bars and session rows for a report config. Every figure is an
 * integer of allocated minutes from splitByDay, so groups, rows, days and the work/other
 * split each sum to the same total.
 */
export function report(
	config: ReportConfig,
	data: ReportData,
	opts: { now: number; includeRunning?: boolean },
): Report {
	const cfg = reportConfigSchema.parse(config);
	const tz = readingZone(data.settings);
	const typeIds = cfg.type_ids === null ? null : new Set(cfg.type_ids);
	const excluded = new Set(cfg.excluded_session_ids);
	const entries = collectEntries(data, cfg.range, tz, {
		now: opts.now,
		includeRunning: opts.includeRunning ?? false,
		keep: (session) =>
			(typeIds === null || typeIds.has(session.type_id)) && !excluded.has(session.id),
	});

	const whole = tally(entries);
	const typeNames = new Map(data.types.map((t) => [t.id, t.name]));
	const other = new Map<string, number>();
	for (const entry of entries) {
		if (!entry.counts_as_work) {
			other.set(entry.type_id, (other.get(entry.type_id) ?? 0) + entry.minutes);
		}
	}
	const other_minutes = [...other]
		.map(([type_id, minutes]) => ({
			type_id,
			name: typeNames.get(type_id) ?? type_id,
			minutes,
		}))
		.sort((a, b) => b.minutes - a.minutes || (a.type_id < b.type_id ? -1 : 1));

	const rows = entries.map((entry) => toRow(entry, cfg.show_notes));
	const groupMembers = new Map<string, { label: string; members: Entry[] }>();
	for (const entry of entries) {
		const { key, label } = dimensionOf(entry, cfg.group_by);
		const group = groupMembers.get(key) ?? { label, members: [] };
		group.members.push(entry);
		groupMembers.set(key, group);
	}
	const groups = sortGroups(
		[...groupMembers].map(([key, { label, members }]) => {
			const split = tally(members);
			return {
				key,
				label,
				minutes: split.minutes,
				work_minutes: split.work_minutes,
				other_minutes: split.minutes - split.work_minutes,
				rows: cfg.show_sessions ? members.map((m) => toRow(m, cfg.show_notes)) : null,
			};
		}),
		cfg.group_by,
	);

	const byDay = groupBy(entries, (entry) => entry.day);
	const days: DayTotal[] = dayRange(cfg.range.from, cfg.range.to).map((day) => ({
		day,
		...tally(byDay.get(day) ?? []),
	}));

	return {
		title: cfg.title,
		range: cfg.range,
		total_minutes: whole.minutes,
		work_minutes: whole.work_minutes,
		other_minutes,
		groups,
		days,
		rows,
	};
}
