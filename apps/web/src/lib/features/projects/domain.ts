import { dayOf, monthBounds, splitByDay } from '@hourtrail/core';
import type { Project, Session, WorkItem } from '@hourtrail/core';

export type ProjectNameResult = { ok: true; name: string } | { ok: false; error: string };

export function validateProjectName(
	input: string,
	projects: Pick<Project, 'id' | 'name' | 'archived_at' | 'deleted_at'>[],
	ignoreId?: string,
): ProjectNameResult {
	const name = input.trim();
	if (!name) return { ok: false, error: 'Enter a project name.' };
	if (
		projects.some(
			(project) =>
				project.id !== ignoreId &&
				project.deleted_at === null &&
				project.archived_at === null &&
				project.name === name,
		)
	)
		return { ok: false, error: 'A project with that name already exists.' };
	return { ok: true, name };
}

export function projectItemCount(projectId: string | null, items: WorkItem[]): number {
	return items.filter((item) => item.deleted_at === null && item.project_id === projectId).length;
}

export function projectMonthMinutes(
	projectId: string | null,
	items: WorkItem[],
	sessions: Session[],
	timeZone: string,
	now: number,
): number {
	const itemProjects = new Map(
		items.filter((item) => item.deleted_at === null).map((item) => [item.id, item.project_id]),
	);
	const day = dayOf(now, timeZone);
	const { first, last } = monthBounds(day);
	let minutes = 0;
	for (const session of sessions) {
		if (session.deleted_at !== null || session.work_item_id === null) continue;
		if (itemProjects.get(session.work_item_id) !== projectId) continue;
		for (const slice of splitByDay(session, timeZone, now)) {
			if (slice.day >= first && slice.day <= last) minutes += slice.minutes;
		}
	}
	return minutes;
}

export function canDeleteProject(projectId: string, items: WorkItem[]): boolean {
	return !items.some((item) => item.deleted_at === null && item.project_id === projectId);
}
