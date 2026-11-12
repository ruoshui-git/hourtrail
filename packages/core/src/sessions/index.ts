import type { Session } from '../schema';
import { sessionMinutes } from '../time';

export type SessionPlan = {
	create: Omit<Session, 'rev' | 'created_at' | 'updated_at' | 'updated_by' | 'deleted_at'>[];
	update: { id: string; changes: Partial<Session> }[];
	remove: string[];
};

export type SplitError = 'running' | 'outside' | 'too-close';

/** Split a stopped session, leaving its note on the original and at least a minute per part. */
export function planSplit(
	s: Session,
	at: number,
	newId: () => string,
): { ok: true; plan: SessionPlan } | { ok: false; error: SplitError } {
	if (s.end_at === null) return { ok: false, error: 'running' };
	if (!(at > s.start_at && at < s.end_at)) return { ok: false, error: 'outside' };
	if (at - s.start_at < 60_000 || s.end_at - at < 60_000) {
		return { ok: false, error: 'too-close' };
	}
	const {
		rev: _rev,
		created_at: _created,
		updated_at: _updated,
		updated_by: _by,
		deleted_at: _deleted,
		...fields
	} = s;
	return {
		ok: true,
		plan: {
			create: [
				{
					...fields,
					id: newId(),
					start_at: at,
					note: '',
					place_candidates: [...s.place_candidates],
					flags: { ...s.flags },
				},
			],
			update: [{ id: s.id, changes: { end_at: at } }],
			remove: [],
		},
	};
}

export type MergeError = 'different-item' | 'different-type' | 'running' | 'same';

function compareSessions(a: Session, b: Session): number {
	return a.start_at - b.start_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Keep the earlier compatible session and include the entire span, including any gap. */
export function planMerge(
	a: Session,
	b: Session,
): { ok: true; plan: SessionPlan; gapMs: number } | { ok: false; error: MergeError } {
	if (a.id === b.id) return { ok: false, error: 'same' };
	if (a.end_at === null || b.end_at === null) return { ok: false, error: 'running' };
	if (a.work_item_id !== b.work_item_id) return { ok: false, error: 'different-item' };
	if (a.type_id !== b.type_id) return { ok: false, error: 'different-type' };
	const [earlier, later] = compareSessions(a, b) <= 0 ? [a, b] : [b, a];
	const place = earlier.place_id === null ? later : earlier;
	return {
		ok: true,
		gapMs: Math.max(0, later.start_at - earlier.end_at!),
		plan: {
			create: [],
			update: [
				{
					id: earlier.id,
					changes: {
						start_at: earlier.start_at,
						end_at: Math.max(a.end_at, b.end_at),
						note: [...new Set([earlier.note, later.note].filter((note) => note !== ''))].join('\n'),
						place_id: place.place_id,
						place_state: place.place_state,
						place_candidates: [...place.place_candidates],
					},
				},
			],
			remove: [later.id],
		},
	};
}

export type Overlap = { a: string; b: string; start: number; end: number; minutes: number };

/** Pairwise positive intersections, with each pair ordered by start time then id. */
export function findOverlaps(sessions: Session[], now: number): Overlap[] {
	const byStart = sessions
		.filter((s) => s.deleted_at === null && (s.end_at ?? now) > s.start_at)
		.sort(compareSessions)
		.map((s) => ({ session: s, end: s.end_at ?? now }));
	const byEnd = [...byStart].sort((a, b) => a.end - b.end);
	const active = new Set<(typeof byStart)[number]>();
	const overlaps: Overlap[] = [];
	let expired = 0;
	for (const current of byStart) {
		while (expired < byEnd.length && byEnd[expired]!.end <= current.session.start_at) {
			active.delete(byEnd[expired++]!);
		}
		// Every active interval intersects the current one: traversal costs exactly k overall.
		for (const previous of active) {
			const start = current.session.start_at;
			const end = Math.min(previous.end, current.end);
			overlaps.push({
				a: previous.session.id,
				b: current.session.id,
				start,
				end,
				minutes: sessionMinutes(start, end),
			});
		}
		active.add(current);
	}
	return overlaps;
}
