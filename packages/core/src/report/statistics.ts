import { readSetting } from '../schema';
import { addDays, daysBetween, monthBounds, weekStart } from '../time';
import type { Day } from '../time';
import { collectEntries, dayRange, dimensionOf, readingZone, tally, toRow } from './entries';
import type { Dimension, Entry, ReportData, ReportRow, Tally } from './entries';

export type StatsRange =
	| { kind: 'day'; day: Day }
	| { kind: 'week'; day: Day }
	| { kind: 'month'; day: Day }
	| { kind: 'custom'; from: Day; to: Day };

export type Breakdown = { key: string; label: string; minutes: number };

export type StatsBar = Tally & { from: Day; to: Day };

export type Statistics = {
	range: { from: Day; to: Day };
	session_count: number;
	total_minutes: number;
	work_minutes: number;
	by_type: { type_id: string; name: string; counts_as_work: boolean; minutes: number }[];
	by_work_item: Breakdown[];
	by_project: Breakdown[];
	by_place: Breakdown[];
	/** Per day, or per week when the range spans more than eight weeks. */
	bar_unit: 'day' | 'week';
	bars: StatsBar[];
	/** Most recent session slices first. */
	recent: ReportRow[];
};

const DAILY_BAR_LIMIT_DAYS = 56;
const RECENT_LIMIT = 10;

function resolveRange(
	range: StatsRange,
	weekStartsOn: 1 | 2 | 3 | 4 | 5 | 6 | 7,
): { from: Day; to: Day } {
	switch (range.kind) {
		case 'day':
			return { from: range.day, to: range.day };
		case 'week': {
			const from = weekStart(range.day, weekStartsOn);
			return { from, to: addDays(from, 6) };
		}
		case 'month': {
			const { first, last } = monthBounds(range.day);
			return { from: first, to: last };
		}
		case 'custom':
			if (range.from > range.to) throw new RangeError('The range must start on or before it ends');
			return { from: range.from, to: range.to };
	}
}

function breakdown(entries: Entry[], dimension: Dimension): Breakdown[] {
	const totals = new Map<string, Breakdown>();
	for (const entry of entries) {
		const { key, label } = dimensionOf(entry, dimension);
		const current = totals.get(key) ?? { key, label, minutes: 0 };
		current.minutes += entry.minutes;
		totals.set(key, current);
	}
	return [...totals.values()].sort(
		(a, b) =>
			b.minutes - a.minutes ||
			(a.label < b.label ? -1 : a.label > b.label ? 1 : 0) ||
			(a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
	);
}

/**
 * Statistics for one range in reporting_tz. Running sessions count up to `now` only when
 * includeRunning is set. Week boundaries follow the synced week_start setting.
 */
export function statistics(
	range: StatsRange,
	data: ReportData,
	opts: { now: number; includeRunning?: boolean },
): Statistics {
	const tz = readingZone(data.settings);
	const weekStartsOn = readSetting('week_start', data.settings.week_start);
	const bounds = resolveRange(range, weekStartsOn);
	const entries = collectEntries(data, bounds, tz, {
		now: opts.now,
		includeRunning: opts.includeRunning ?? false,
	});

	const whole = tally(entries);
	const workTypes = new Set(entries.filter((e) => e.counts_as_work).map((e) => e.type_id));
	const by_type = breakdown(entries, 'type').map((b) => ({
		type_id: b.key,
		name: b.label,
		counts_as_work: workTypes.has(b.key),
		minutes: b.minutes,
	}));

	let spans: { from: Day; to: Day }[];
	let bar_unit: 'day' | 'week';
	if (daysBetween(bounds.from, bounds.to) + 1 <= DAILY_BAR_LIMIT_DAYS) {
		bar_unit = 'day';
		spans = dayRange(bounds.from, bounds.to).map((day) => ({ from: day, to: day }));
	} else {
		bar_unit = 'week';
		spans = [];
		for (
			let start = weekStart(bounds.from, weekStartsOn);
			start <= bounds.to;
			start = addDays(start, 7)
		) {
			spans.push({
				from: start > bounds.from ? start : bounds.from,
				to: addDays(start, 6) < bounds.to ? addDays(start, 6) : bounds.to,
			});
		}
	}
	const bars: StatsBar[] = spans.map((span) => ({
		from: span.from,
		to: span.to,
		...tally(entries.filter((e) => e.day >= span.from && e.day <= span.to)),
	}));

	return {
		range: bounds,
		session_count: new Set(entries.map((e) => e.session_id)).size,
		total_minutes: whole.minutes,
		work_minutes: whole.work_minutes,
		by_type,
		by_work_item: breakdown(entries, 'work_item'),
		by_project: breakdown(entries, 'project'),
		by_place: breakdown(entries, 'place'),
		bar_unit,
		bars,
		recent: entries
			.slice(-RECENT_LIMIT)
			.reverse()
			.map((entry) => toRow(entry, true)),
	};
}
