import {
	dayBounds,
	dayOf,
	parseLocalDateTime,
	sessionMinutes,
	type RecordOf,
} from '@hourtrail/core';

type Session = RecordOf<'session'>;
type WorkItem = RecordOf<'work_item'>;
type ActivityType = RecordOf<'activity_type'>;
type Project = RecordOf<'project'>;
type Place = RecordOf<'place'>;

export type SearchFilters = {
	query?: string;
	types?: string[];
	project?: string;
	place?: string;
	from?: string;
	to?: string;
};

export type SearchData = {
	sessions: Session[];
	items: WorkItem[];
	types: ActivityType[];
	projects: Project[];
	places: Place[];
};

const fold = (value: string) => value.toLocaleLowerCase();

export function searchSessions(
	data: SearchData,
	filters: SearchFilters,
	zone: string,
	now: number,
) {
	const items = new Map(data.items.map((item) => [item.id, item]));
	const projects = new Map(data.projects.map((project) => [project.id, project]));
	const places = new Map(data.places.map((place) => [place.id, place]));
	const query = fold(filters.query?.trim() ?? '');
	const typeIds = new Set(filters.types ?? []);
	const bound = (value: string | undefined, isEnd: boolean) => {
		if (!value) return undefined;
		try {
			if (value.length === 10)
				return isEnd ? dayBounds(value, zone).end : dayBounds(value, zone).start;
			const parsed = parseLocalDateTime(value, zone);
			return parsed.ok ? parsed.instant + (isEnd ? 60_000 : 0) : undefined;
		} catch {
			return undefined;
		}
	};
	const fromInstant = bound(filters.from, false);
	const toInstant = bound(filters.to, true);
	const fromDay = filters.from?.slice(0, 10);
	const toDay = filters.to?.slice(0, 10);
	const matched = data.sessions.filter((session) => {
		if (session.deleted_at !== null) return false;
		const item = items.get(session.work_item_id ?? '');
		const project = projects.get(item?.project_id ?? '');
		const place = places.get(session.place_id ?? item?.place_id ?? '');
		if (typeIds.size && !typeIds.has(session.type_id)) return false;
		if (filters.project && item?.project_id !== filters.project) return false;
		if (filters.place && session.place_id !== filters.place && item?.place_id !== filters.place)
			return false;
		const day = dayOf(session.start_at, zone);
		if (fromDay && day < fromDay) return false;
		if (toDay && day > toDay) return false;
		if (fromInstant !== undefined && session.start_at < fromInstant) return false;
		if (toInstant !== undefined && session.start_at >= toInstant) return false;
		if (!query) return true;
		return [item?.name, session.note, project?.name, place?.name].some((value) =>
			fold(value ?? '').includes(query),
		);
	});
	matched.sort((a, b) => b.start_at - a.start_at || a.id.localeCompare(b.id));
	const minutes = matched.reduce(
		(total, session) => total + sessionMinutes(session.start_at, session.end_at ?? now),
		0,
	);
	return { sessions: matched, minutes };
}
