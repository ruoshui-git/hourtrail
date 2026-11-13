import type { ActivityType, Place, Project, Session, SettingKey, WorkItem } from '../schema';
import { readSetting } from '../schema';
import { addDays, daysBetween, splitByDay, toLocalDateTime } from '../time';
import type { Day } from '../time';

/** Plain records as stored locally, tombstones included (they still provide labels). */
export type ReportData = {
	sessions: Session[];
	work_items: WorkItem[];
	projects: Project[];
	types: ActivityType[];
	places: Place[];
	settings: Partial<Record<SettingKey, unknown>>;
};

export type ReportRow = {
	session_id: string;
	day: Day;
	start_at: number;
	end_at: number;
	start_local: string;
	end_local: string;
	minutes: number;
	type_id: string;
	type_name: string;
	counts_as_work: boolean;
	project_id: string | null;
	project_name: string | null;
	work_item_id: string | null;
	work_item_name: string | null;
	place_id: string | null;
	place_name: string | null;
	note: string | null;
};

/** One session slice inside the range, carrying the labels it needs. */
export type Entry = Omit<ReportRow, 'start_local' | 'end_local' | 'note'> & {
	note: string;
	tz: string;
};

export function readingZone(settings: ReportData['settings']): string {
	const tz = readSetting('reporting_tz', settings.reporting_tz);
	if (tz === null) throw new RangeError('reporting_tz is not set');
	return tz;
}

export type CollectOptions = {
	now: number;
	includeRunning: boolean;
	keep?: (session: Session) => boolean;
};

/**
 * Every session slice whose day falls in [from, to]. Minutes come straight from splitByDay,
 * the same allocation History uses, so reports and History agree to the minute.
 */
export function collectEntries(
	data: ReportData,
	range: { from: Day; to: Day },
	tz: string,
	opts: CollectOptions,
): Entry[] {
	const types = new Map(data.types.map((t) => [t.id, t]));
	const workItems = new Map(data.work_items.map((w) => [w.id, w]));
	const projects = new Map(data.projects.map((p) => [p.id, p]));
	const places = new Map(data.places.map((p) => [p.id, p]));
	const entries: Entry[] = [];
	for (const session of data.sessions) {
		if (session.deleted_at !== null) continue;
		if (session.end_at === null && !opts.includeRunning) continue;
		if (opts.keep && !opts.keep(session)) continue;
		const type = types.get(session.type_id);
		const workItem = session.work_item_id ? workItems.get(session.work_item_id) : undefined;
		const project = workItem?.project_id ? projects.get(workItem.project_id) : undefined;
		const place = session.place_id ? places.get(session.place_id) : undefined;
		for (const slice of splitByDay(session, tz, opts.now)) {
			if (slice.day < range.from || slice.day > range.to) continue;
			entries.push({
				session_id: session.id,
				day: slice.day,
				start_at: slice.start,
				end_at: slice.end,
				minutes: slice.minutes,
				type_id: session.type_id,
				type_name: type ? type.name : session.type_id,
				counts_as_work: type?.counts_as_work === true,
				project_id: project ? project.id : null,
				project_name: project ? project.name : null,
				work_item_id: workItem ? workItem.id : null,
				work_item_name: workItem ? workItem.name : null,
				place_id: place ? place.id : null,
				place_name: place ? place.name : null,
				note: session.note,
				tz,
			});
		}
	}
	return entries.sort(
		(a, b) =>
			a.start_at - b.start_at ||
			(a.session_id < b.session_id ? -1 : a.session_id > b.session_id ? 1 : 0),
	);
}

export function toRow(entry: Entry, showNotes: boolean): ReportRow {
	const { tz, ...fields } = entry;
	return {
		...fields,
		start_local: toLocalDateTime(entry.start_at, tz),
		end_local: toLocalDateTime(entry.end_at, tz),
		note: showNotes ? entry.note : null,
	};
}

export type Dimension = 'work_item' | 'project' | 'place' | 'type' | 'day';

export const UNTITLED_LABEL = 'Untitled';
export const NO_PROJECT_LABEL = 'No project';
export const NO_PLACE_LABEL = 'No place';

/** The grouping key and its English fallback label; missing names fall back, never vanish. */
export function dimensionOf(entry: Entry, dimension: Dimension): { key: string; label: string } {
	switch (dimension) {
		case 'work_item':
			return { key: entry.work_item_id ?? '', label: entry.work_item_name ?? UNTITLED_LABEL };
		case 'project':
			return { key: entry.project_id ?? '', label: entry.project_name ?? NO_PROJECT_LABEL };
		case 'place':
			return { key: entry.place_id ?? '', label: entry.place_name ?? NO_PLACE_LABEL };
		case 'type':
			return { key: entry.type_id, label: entry.type_name };
		case 'day':
			return { key: entry.day, label: entry.day };
	}
}

export function groupBy<K, T>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
	const groups = new Map<K, T[]>();
	for (const item of items) {
		const key = keyOf(item);
		const bucket = groups.get(key);
		if (bucket) bucket.push(item);
		else groups.set(key, [item]);
	}
	return groups;
}

export type Tally = {
	minutes: number;
	work_minutes: number;
	by_type: { type_id: string; minutes: number }[];
};

/** Minutes for a set of slices, split into work (counts_as_work) and by-type totals. */
export function tally(entries: Entry[]): Tally {
	let minutes = 0;
	let work_minutes = 0;
	const byType = new Map<string, number>();
	for (const entry of entries) {
		minutes += entry.minutes;
		if (entry.counts_as_work) work_minutes += entry.minutes;
		byType.set(entry.type_id, (byType.get(entry.type_id) ?? 0) + entry.minutes);
	}
	const by_type = [...byType]
		.map(([type_id, total]) => ({ type_id, minutes: total }))
		.sort((a, b) => (a.type_id < b.type_id ? -1 : a.type_id > b.type_id ? 1 : 0));
	return { minutes, work_minutes, by_type };
}

/** Every calendar day from `from` to `to`, inclusive, in reporting_tz terms. */
export function dayRange(from: Day, to: Day): Day[] {
	return Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => addDays(from, i));
}
