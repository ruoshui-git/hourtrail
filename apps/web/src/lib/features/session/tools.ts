import type { RecordOf, SessionPlan } from '@hourtrail/core';
import type { Repo, UndoToken } from '$lib/db/repo';

type Session = RecordOf<'session'>;

/** Return the immediate live chronological neighbor when it is merge compatible. */
export function findAdjacentCompatibleSession(
	sessions: Session[],
	current: Session,
): Session | null {
	const sorted = sessions
		.filter((session) => session.deleted_at === null)
		.sort((a, b) => a.start_at - b.start_at || a.id.localeCompare(b.id));
	const index = sorted.findIndex((session) => session.id === current.id);
	if (index < 0 || current.end_at === null) return null;
	const previous = sorted[index - 1];
	const next = sorted[index + 1];
	for (const candidate of [previous, next]) {
		if (
			candidate &&
			candidate.end_at !== null &&
			candidate.work_item_id === current.work_item_id &&
			candidate.type_id === current.type_id
		)
			return candidate;
	}
	return null;
}

export function applySessionPlan(
	repo: Pick<Repo, 'applyPlan'>,
	label: string,
	plan: SessionPlan,
): Promise<UndoToken> {
	return repo.applyPlan(label, 'session', plan);
}
