import type { RecordOf } from '../schema';
import { findOverlaps } from '../sessions';
import { dayBounds, sessionMinutes, splitByDay } from '../time';

export type ReviewIssue = {
	key: string;
	kind:
		| 'running-long'
		| 'two-running'
		| 'untitled'
		| 'no-note'
		| 'place'
		| 'overlap'
		| 'suspect-time'
		| 'gap'
		| 'conflict';
	severity: 'caution' | 'neutral';
	message: string;
	session_ids: string[];
	start?: number;
	end?: number;
	state: 'open' | 'reviewed' | 'dismissed';
};

export type ReviewInput = {
	sessions: RecordOf<'session'>[];
	items: RecordOf<'work_item'>[];
	types: RecordOf<'activity_type'>[];
	places: RecordOf<'place'>[];
	conflicts: RecordOf<'conflict'>[];
	marks: RecordOf<'review_mark'>[];
	settings: {
		long_gap_min: number;
		long_session_min: number;
		note_prompt: 'work' | 'all' | 'none';
	};
	tz: string;
	now: number;
	formatTime: (ms: number) => string;
};

// SPEC's table order also breaks ties when several checks concern the same time.
const kindOrder: ReviewIssue['kind'][] = [
	'running-long',
	'two-running',
	'untitled',
	'no-note',
	'place',
	'overlap',
	'suspect-time',
	'gap',
	'conflict',
];
const cautions = new Set<ReviewIssue['kind']>([
	'running-long',
	'two-running',
	'overlap',
	'suspect-time',
	'conflict',
]);
const minute = 60_000;
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function duration(start: number, end: number): string {
	const minutes = sessionMinutes(start, end);
	const hours = Math.floor(minutes / 60);
	return hours > 0 ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
}

/** List a day's checks without changing records or assuming unrecorded time was work. */
export function review(day: string, input: ReviewInput): ReviewIssue[] {
	const bounds = dayBounds(day, input.tz);
	const onDay = input.sessions
		.filter((session) => session.deleted_at === null)
		.flatMap((session) =>
			splitByDay(session, input.tz, input.now)
				.filter((slice) => slice.day === day)
				.map((slice) => ({ session, slice })),
		)
		.sort((a, b) => a.slice.start - b.slice.start || compareText(a.session.id, b.session.id));
	const byId = new Map(onDay.map((entry) => [entry.session.id, entry]));
	const types = new Map(input.types.map((type) => [type.id, type]));
	const marks = new Map(
		input.marks
			.filter((mark) => mark.deleted_at === null && mark.day === day)
			.map((mark) => [mark.issue_key, mark.state]),
	);
	const issues: ReviewIssue[] = [];
	const range = (start: number, end: number) =>
		`${input.formatTime(start)}–${input.formatTime(end)}`;
	function add(
		kind: ReviewIssue['kind'],
		key: string,
		message: string,
		session_ids: string[],
		start: number,
		end: number,
	): void {
		issues.push({
			key,
			kind,
			severity: cautions.has(kind) ? 'caution' : 'neutral',
			message,
			session_ids,
			start,
			end,
			state: marks.get(key) ?? 'open',
		});
	}

	for (const { session: s, slice } of onDay) {
		const end = s.end_at ?? input.now;
		const elapsed = end - s.start_at;
		const addSession = (kind: ReviewIssue['kind'], message: string) =>
			add(kind, `${kind}:${s.id}`, message, [s.id], slice.start, slice.end);
		if (s.end_at === null && elapsed > input.settings.long_session_min * minute) {
			addSession('running-long', `Running for ${duration(s.start_at, end)}`);
		}
		if (s.work_item_id === null) {
			addSession('untitled', `Untitled session, ${range(slice.start, slice.end)}`);
		}
		const noteCovered =
			input.settings.note_prompt === 'all' ||
			(input.settings.note_prompt === 'work' && types.get(s.type_id)?.counts_as_work === true);
		if (s.note === '' && elapsed >= 15 * minute && noteCovered) {
			addSession('no-note', 'No note');
		}
		if (['unresolved', 'ambiguous', 'suggested'].includes(s.place_state)) {
			addSession('place', 'Place not confirmed');
		}
		if (
			elapsed > 16 * 60 * minute ||
			s.start_at > input.now ||
			s.flags.clock_suspect ||
			end < s.start_at
		) {
			addSession('suspect-time', 'Check session times');
		}
	}

	const running = onDay.filter(({ session }) => session.end_at === null);
	if (running.length > 1) {
		add(
			'two-running',
			'two-running',
			'More than one session is running',
			running.map(({ session }) => session.id),
			running[0]!.slice.start,
			Math.max(...running.map(({ slice }) => slice.end)),
		);
	}
	for (const overlap of findOverlaps(
		onDay.map(({ session }) => session),
		input.now,
	)) {
		const start = Math.max(bounds.start, overlap.start);
		const end = Math.min(bounds.end, overlap.end);
		if (end <= start) continue;
		add(
			'overlap',
			`overlap:${overlap.a}:${overlap.b}`,
			`Sessions overlap by ${duration(start, end)}`,
			[overlap.a, overlap.b],
			start,
			end,
		);
	}

	// Track the union's furthest end: a nested session must not create a false gap.
	let previousEnd: number | undefined;
	for (const { slice } of onDay) {
		if (
			previousEnd !== undefined &&
			slice.start > previousEnd &&
			slice.start - previousEnd >= input.settings.long_gap_min * minute
		) {
			add(
				'gap',
				`gap:${day}:${previousEnd}`,
				`${duration(previousEnd, slice.start)} not recorded, ${range(previousEnd, slice.start)}`,
				[],
				previousEnd,
				slice.start,
			);
		}
		previousEnd = Math.max(previousEnd ?? slice.end, slice.end);
	}
	for (const conflict of input.conflicts) {
		const entry = byId.get(conflict.record_id);
		if (
			!entry ||
			conflict.entity !== 'session' ||
			conflict.deleted_at !== null ||
			conflict.resolved_at !== null
		) {
			continue;
		}
		add(
			'conflict',
			`conflict:${conflict.id}`,
			'Session has an unresolved sync conflict',
			[entry.session.id],
			entry.slice.start,
			entry.slice.end,
		);
	}
	return issues.sort(
		(a, b) =>
			a.start! - b.start! ||
			kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) ||
			compareText(a.key, b.key),
	);
}

export function openIssueCount(issues: ReviewIssue[]): number {
	return issues.filter((issue) => issue.state === 'open').length;
}
