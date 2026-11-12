import { Temporal } from 'temporal-polyfill';

export type Day = string;

function plainDay(day: Day): Temporal.PlainDate {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new RangeError('Invalid calendar day');
	return Temporal.PlainDate.from(day, { overflow: 'reject' });
}

export function isValidDay(day: string): boolean {
	try {
		plainDay(day);
		return true;
	} catch {
		return false;
	}
}

export function isValidZone(tz: string): boolean {
	try {
		if (/^[+-]/.test(tz)) return false;
		Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(tz);
		return true;
	} catch {
		return false;
	}
}

export function dayOf(instant: number, tz: string): Day {
	return Temporal.Instant.fromEpochMilliseconds(instant)
		.toZonedDateTimeISO(tz)
		.toPlainDate()
		.toString();
}

export function dayBounds(day: Day, tz: string): { start: number; end: number } {
	const date = plainDay(day);
	return {
		start: date.toZonedDateTime(tz).epochMilliseconds,
		end: date.add({ days: 1 }).toZonedDateTime(tz).epochMilliseconds,
	};
}

export function addDays(day: Day, n: number): Day {
	if (!Number.isInteger(n)) throw new RangeError('Days must be an integer');
	return plainDay(day).add({ days: n }).toString();
}

export function daysBetween(from: Day, to: Day): number {
	return plainDay(from).until(plainDay(to), { largestUnit: 'day' }).days;
}

export function weekStart(day: Day, weekStartsOn: 1 | 2 | 3 | 4 | 5 | 6 | 7): Day {
	return addDays(day, -((plainDay(day).dayOfWeek - weekStartsOn + 7) % 7));
}

export function monthBounds(day: Day): { first: Day; last: Day } {
	const date = plainDay(day);
	return {
		first: date.with({ day: 1 }).toString(),
		last: date.with({ day: date.daysInMonth }).toString(),
	};
}

export function sessionMinutes(startAt: number, endAt: number): number {
	return Math.round((endAt - startAt) / 60_000);
}

export type Slice = {
	day: Day;
	start: number;
	end: number;
	minutes: number;
	first: boolean;
	last: boolean;
};

export function splitByDay(
	s: { start_at: number; end_at: number | null },
	tz: string,
	now: number,
): Slice[] {
	const end = Math.max(s.start_at, s.end_at ?? now);
	const total = sessionMinutes(s.start_at, end);
	const slices: Slice[] = [];
	let start = s.start_at;
	let allocated = 0;
	do {
		const day = dayOf(start, tz);
		const sliceEnd = Math.min(end, dayBounds(day, tz).end);
		const last = sliceEnd === end;
		const minutes = last ? total - allocated : Math.floor((sliceEnd - start) / 60_000);
		slices.push({ day, start, end: sliceEnd, minutes, first: slices.length === 0, last });
		allocated += minutes;
		start = sliceEnd;
	} while (start < end);
	return slices;
}

export type LocalParse =
	| { ok: true; instant: number; ambiguous: boolean }
	| { ok: false; reason: 'invalid' | 'nonexistent' };

export function parseLocalDateTime(value: string, tz: string): LocalParse {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !isValidZone(tz)) {
		return { ok: false, reason: 'invalid' };
	}
	try {
		const local = Temporal.PlainDateTime.from(value, { overflow: 'reject' });
		const earlier = local.toZonedDateTime(tz, { disambiguation: 'earlier' });
		const later = local.toZonedDateTime(tz, { disambiguation: 'later' });
		if (!earlier.toPlainDateTime().equals(local)) return { ok: false, reason: 'nonexistent' };
		return {
			ok: true,
			instant: earlier.epochMilliseconds,
			ambiguous: earlier.epochMilliseconds !== later.epochMilliseconds,
		};
	} catch {
		return { ok: false, reason: 'invalid' };
	}
}

export function toLocalDateTime(instant: number, tz: string): string {
	return Temporal.Instant.fromEpochMilliseconds(instant)
		.toZonedDateTimeISO(tz)
		.toPlainDateTime()
		.toString({ smallestUnit: 'minute' });
}

export function elapsedMs(startAt: number, now: number): number {
	return Math.max(0, now - startAt);
}
