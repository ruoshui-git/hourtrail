import { formatMinutes } from '$lib/format';
import { dayBounds, dayOf, parseLocalDateTime, splitByDay, type Day } from '@hourtrail/core';
import type { RibbonSegment, TrailRow } from '$lib/components';
import { formatClock } from '$lib/components/trail';
import type { RecordOf } from '@hourtrail/core';

type Session = RecordOf<'session'>;
type WorkItem = RecordOf<'work_item'>;
type ActivityType = RecordOf<'activity_type'>;
type Place = RecordOf<'place'>;

export type HistorySettings = { long_gap_min?: number };
export type DayModel = {
	dayStart: number;
	dayEnd: number;
	ticks: { at: number; label: string }[];
	segments: RibbonSegment[];
	rows: TrailRow[];
	totals: { work: number; other: number };
};

const tickFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });
// One duration style across the app (DESIGN_SYSTEM Voice): "2h 14m", "45m".
const duration = formatMinutes;

export function buildDay(
	day: Day,
	tz: string,
	sessions: Session[],
	items: WorkItem[],
	types: ActivityType[],
	places: Place[],
	settings: HistorySettings,
	now: number,
): DayModel {
	const { start: dayStart, end: dayEnd } = dayBounds(day, tz);
	const itemById = new Map(items.map((item) => [item.id, item]));
	const typeById = new Map(types.map((type) => [type.id, type]));
	const placeById = new Map(places.map((place) => [place.id, place]));
	const slices = sessions.flatMap((session) =>
		splitByDay(session, tz, now)
			.filter((slice) => slice.day === day)
			.map((slice) => ({ session, slice })),
	);
	slices.sort((a, b) => a.slice.start - b.slice.start || a.session.id.localeCompare(b.session.id));
	const longGapMs = (settings.long_gap_min ?? 60) * 60_000;
	const rows: TrailRow[] = [];
	let work = 0;
	let other = 0;
	let previousEnd: number | undefined;
	for (const { session, slice } of slices) {
		const type = typeById.get(session.type_id);
		if (type?.counts_as_work) work += slice.minutes;
		else other += slice.minutes;
		if (previousEnd !== undefined && slice.start - previousEnd >= longGapMs) {
			const gapStart = previousEnd;
			const gapEnd = slice.start;
			const gapMinutes = Math.round((gapEnd - gapStart) / 60_000);
			rows.push({
				kind: 'gap',
				id: `gap:${gapStart}`,
				start: gapStart,
				end: gapEnd,
				rangeLabel: `${formatClock(gapStart)} to ${formatClock(gapEnd)}`,
				durationLabel: duration(gapMinutes),
			});
		}
		const item = itemById.get(session.work_item_id ?? '');
		const place = placeById.get(session.place_id ?? '');
		rows.push({
			kind: 'session',
			id: session.id,
			startLabel: slice.start <= dayStart ? formatClock(dayStart) : formatClock(slice.start),
			endLabel: session.end_at === null ? null : formatClock(slice.end),
			name: item?.name ?? null,
			typeName: type?.name ?? 'Work',
			typeColor: type?.color ?? 'lake',
			placeName: place?.name,
			note: session.note || undefined,
			durationLabel: duration(slice.minutes),
			pending: false,
			continuesFromPreviousDay: !slice.first,
			continuesNextDay: !slice.last,
			running: session.end_at === null,
		});
		previousEnd = Math.max(previousEnd ?? slice.end, slice.end);
	}
	const ticks = [0, 6, 12, 18].flatMap((hour) => {
		const parsed = parseLocalDateTime(`${day}T${String(hour).padStart(2, '0')}:00`, tz);
		return parsed.ok ? [{ at: parsed.instant, label: tickFormatter.format(parsed.instant) }] : [];
	});
	const segments = slices.map(({ session, slice }) => ({
		id: session.id,
		start: slice.start,
		end: session.end_at === null ? null : slice.end,
		color: typeById.get(session.type_id)?.color ?? 'lake',
		label: `${itemById.get(session.work_item_id ?? '')?.name ?? 'Untitled session'}, ${formatClock(slice.start)} to ${session.end_at === null ? 'now' : formatClock(slice.end)}`,
	}));
	return { dayStart, dayEnd, ticks, segments, rows, totals: { work, other } };
}

export function dayOfTimestamp(instant: number, tz: string): Day {
	return dayOf(instant, tz);
}
