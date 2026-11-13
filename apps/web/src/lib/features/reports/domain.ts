import {
	addDays,
	daysBetween,
	formatHours,
	isValidDay,
	monthBounds,
	type ActivityType,
	type BlazeKey,
	type Breakdown,
	type Day,
	type Statistics,
	type StatsRange,
} from '@hourtrail/core';
import type { ChartBar, ChartSeries } from '$lib/components';

export type PeriodTable = {
	columns: { key: string; label: string; align: 'end' | 'start'; numeric: boolean }[];
	rows: Record<string, string>[];
	footer: Record<string, string>;
};

/**
 * The table under the chart: only periods with recorded time, then a Total row. Every figure
 * is core's (bar minutes and by-type minutes), formatted, never summed here.
 */
export function periodTable(
	stats: Statistics,
	series: ChartSeries[],
	format: 'hm' | 'decimal',
): PeriodTable {
	const columns = [
		{ key: 'label', label: 'Period', align: 'start' as const, numeric: false },
		...series.map((item, index) => ({
			key: `series${index}`,
			label: item.label,
			align: 'end' as const,
			numeric: true,
		})),
		{ key: 'total', label: 'Total', align: 'end' as const, numeric: true },
	];
	const minutesOf = (bar: Statistics['bars'][number], key: string) =>
		bar.by_type.find((type) => type.type_id === key)?.minutes ?? 0;
	const cells = (label: string, total: number, minutes: (key: string) => number) =>
		Object.fromEntries([
			['label', label],
			...series.map((item, index) => [`series${index}`, formatHours(minutes(item.key), format)]),
			['total', formatHours(total, format)],
		]);
	const labels = chartBars(stats);
	const rows = stats.bars.flatMap((bar, index) =>
		bar.minutes > 0
			? [cells(labels[index]?.label ?? bar.from, bar.minutes, (key) => minutesOf(bar, key))]
			: [],
	);
	const footer = cells(
		'Total',
		stats.total_minutes,
		(key) => stats.by_type.find((type) => type.type_id === key)?.minutes ?? 0,
	);
	return { columns, rows, footer };
}

export type ReportUnit = 'day' | 'week' | 'month' | 'custom';
export type ReportRange =
	{ unit: 'day' | 'week' | 'month'; day: Day } | { unit: 'custom'; from: Day; to: Day };

export type BreakdownDimension = 'by_work_item' | 'by_project' | 'by_place';
export type BreakdownItem = { id: string; label: string; color: BlazeKey; minutes: number };

export function parseUnit(value: string): ReportUnit {
	return value === 'day' || value === 'week' || value === 'custom' ? value : 'month';
}

export function toStatsRange(range: ReportRange): StatsRange {
	return range.unit === 'custom'
		? { kind: 'custom', from: range.from, to: range.to }
		: { kind: range.unit, day: range.day };
}

/** One step back (-1) or forward (1) by the chosen unit. Custom moves by its own length. */
export function shiftRange(range: ReportRange, step: 1 | -1): ReportRange {
	switch (range.unit) {
		case 'day':
			return { unit: 'day', day: addDays(range.day, step) };
		case 'week':
			return { unit: 'week', day: addDays(range.day, 7 * step) };
		case 'month': {
			const bounds = monthBounds(range.day);
			const edge = step > 0 ? addDays(bounds.last, 1) : addDays(bounds.first, -1);
			return { unit: 'month', day: monthBounds(edge).first };
		}
		case 'custom': {
			const length = daysBetween(range.from, range.to) + 1;
			return {
				unit: 'custom',
				from: addDays(range.from, step * length),
				to: addDays(range.to, step * length),
			};
		}
	}
}

/** Null when the custom dates are usable; otherwise the sentence to show under the fields. */
export function customProblem(from: string, to: string): string | null {
	if (!isValidDay(from) || !isValidDay(to)) return 'Use dates like 2026-11-12.';
	if (from > to) return 'The first date must be on or before the last date.';
	return null;
}

const MONTH_DAY = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC',
});
const LONG_DAY = new Intl.DateTimeFormat('en-US', {
	weekday: 'short',
	month: 'short',
	day: 'numeric',
	year: 'numeric',
	timeZone: 'UTC',
});
const MONTH_YEAR = new Intl.DateTimeFormat('en-US', {
	month: 'long',
	year: 'numeric',
	timeZone: 'UTC',
});

function utcDate(day: Day): Date {
	const [year, month, date] = day.split('-').map(Number);
	return new Date(Date.UTC(year!, month! - 1, date!));
}

/** "Thu, Nov 12, 2026", "November 2026", "Nov 9–15, 2026" or "Nov 30 – Dec 6, 2026". */
export function rangeTitle(span: { from: Day; to: Day }, unit: ReportUnit): string {
	const from = utcDate(span.from);
	const to = utcDate(span.to);
	if (unit === 'month') return MONTH_YEAR.format(from);
	if (span.from === span.to) return LONG_DAY.format(from);
	const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
	const sameMonth = sameYear && from.getUTCMonth() === to.getUTCMonth();
	if (sameMonth) return `${MONTH_DAY.format(from)}–${to.getUTCDate()}, ${to.getUTCFullYear()}`;
	if (sameYear)
		return `${MONTH_DAY.format(from)} – ${MONTH_DAY.format(to)}, ${to.getUTCFullYear()}`;
	return `${MONTH_DAY.format(from)}, ${from.getUTCFullYear()} – ${MONTH_DAY.format(to)}, ${to.getUTCFullYear()}`;
}

/** Stack series for the bar chart: only types with time in the range, in type order. */
export function chartSeries(
	stats: Statistics,
	types: Pick<ActivityType, 'id' | 'color' | 'sort_key'>[],
	fallback: BlazeKey,
): ChartSeries[] {
	const colorOf = new Map(types.map((type) => [type.id, type.color]));
	const orderOf = new Map(types.map((type) => [type.id, type.sort_key]));
	return stats.by_type
		.filter((type) => type.minutes > 0)
		.sort((a, b) => (orderOf.get(a.type_id) ?? 0) - (orderOf.get(b.type_id) ?? 0))
		.map((type) => ({
			key: type.type_id,
			label: type.name,
			color: colorOf.get(type.type_id) ?? fallback,
		}));
}

export function chartBars(stats: Statistics): ChartBar[] {
	return stats.bars.map((bar) => ({
		id: bar.from,
		label: MONTH_DAY.format(utcDate(bar.from)),
		values: Object.fromEntries(bar.by_type.map((type) => [type.type_id, type.minutes])),
	}));
}

/**
 * A breakdown row is coloured by the activity type that holds most of its time. The per-type
 * statistics come from core, so the UI never adds durations itself.
 */
export function breakdownItems(
	stats: Statistics,
	dimension: BreakdownDimension,
	perType: { color: BlazeKey; stats: Statistics }[],
	fallback: BlazeKey,
): BreakdownItem[] {
	return stats[dimension].map((row: Breakdown) => {
		let best: { minutes: number; color: BlazeKey } | null = null;
		for (const type of perType) {
			const hit = type.stats[dimension].find((entry) => entry.key === row.key);
			if (hit && hit.minutes > 0 && (best === null || hit.minutes > best.minutes)) {
				best = { minutes: hit.minutes, color: type.color };
			}
		}
		return {
			id: `${dimension}:${row.key}`,
			label: row.label,
			color: best?.color ?? fallback,
			minutes: row.minutes,
		};
	});
}
