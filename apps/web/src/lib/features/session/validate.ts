import { findOverlaps, parseLocalDateTime } from '@hourtrail/core';
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
	const candidate: RecordOf<'session'> = {
		id: currentId ?? '00000000-0000-7000-8000-000000000000',
		rev: 0,
		created_at: now,
		updated_at: now,
		deleted_at: null,
		updated_by: '',
		work_item_id: null,
		type_id: '',
		start_at: start,
		start_tz: 'UTC',
		end_at: end,
		end_tz: end === null ? null : 'UTC',
		note: '',
		source: 'manual',
		place_id: null,
		place_state: 'none',
		place_candidates: [],
		flags: {},
		origin_device_id: '',
	};
	const overlap = findOverlaps(
		[...sessions.filter((item) => item.id !== currentId), candidate],
		now,
	).find((pair) => pair.a === candidate.id || pair.b === candidate.id);
	if (overlap) {
		const otherId = overlap.a === candidate.id ? overlap.b : overlap.a;
		const other = sessions.find((item) => item.id === otherId);
		const item = items.find((entry) => entry.id === other?.work_item_id);
		warnings.push(`Overlaps ${item?.name ?? 'another session'} by ${overlap.minutes}m`);
	}
	if (actualEnd - start > 16 * 60 * 60 * 1000)
		warnings.push('This session is longer than 16 hours.');
	if (start > now) warnings.push('This session starts in the future.');
	return warnings;
}
