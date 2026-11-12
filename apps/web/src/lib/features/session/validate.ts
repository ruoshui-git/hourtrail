import { parseLocalDateTime, sessionMinutes } from '@hourtrail/core';
import type { RecordOf } from '@hourtrail/core';

export type TimeValidation =
	| { ok: true; start: number; end: number | null; ambiguousStart: boolean; ambiguousEnd: boolean }
	| { ok: false; field: 'start' | 'end'; message: string };

export function validateSessionTimes(
	startValue: string,
	endValue: string,
	zone: string,
	allowRunning = true,
): TimeValidation {
	const start = parseLocalDateTime(startValue, zone);
	if (!start.ok)
		return {
			ok: false,
			field: 'start',
			message:
				start.reason === 'nonexistent'
					? "That time doesn't exist on this day (clocks went forward)."
					: 'Enter a valid start time.',
		};
	if (!endValue && !allowRunning)
		return { ok: false, field: 'end', message: 'Enter an end time for this session.' };
	if (!endValue)
		return {
			ok: true,
			start: start.instant,
			end: null,
			ambiguousStart: start.ambiguous,
			ambiguousEnd: false,
		};
	const end = parseLocalDateTime(endValue, zone);
	if (!end.ok)
		return {
			ok: false,
			field: 'end',
			message:
				end.reason === 'nonexistent'
					? "That time doesn't exist on this day (clocks went forward)."
					: 'Enter a valid end time.',
		};
	if (end.instant <= start.instant)
		return { ok: false, field: 'end', message: 'End must be after start.' };
	return {
		ok: true,
		start: start.instant,
		end: end.instant,
		ambiguousStart: start.ambiguous,
		ambiguousEnd: end.ambiguous,
	};
}

export function sessionWarnings(
	start: number,
	end: number | null,
	sessions: RecordOf<'session'>[],
	items: RecordOf<'work_item'>[],
	currentId: string | null,
	now = Date.now(),
): string[] {
	const warnings: string[] = [];
	const actualEnd = end ?? now;
	const overlap = sessions.find(
		(session) =>
			session.deleted_at === null &&
			session.id !== currentId &&
			session.start_at < actualEnd &&
			(session.end_at ?? now) > start,
	);
	if (overlap) {
		const overlapMinutes = Math.max(
			1,
			sessionMinutes(Math.max(start, overlap.start_at), Math.min(actualEnd, overlap.end_at ?? now)),
		);
		const item = items.find((candidate) => candidate.id === overlap.work_item_id);
		warnings.push(`Overlaps ${item?.name ?? 'another session'} by ${overlapMinutes}m`);
	}
	if (actualEnd - start > 16 * 60 * 60 * 1000)
		warnings.push('This session is longer than 16 hours.');
	if (start > now) warnings.push('This session starts in the future.');
	return warnings;
}
