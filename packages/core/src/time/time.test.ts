import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
	addDays,
	dayBounds,
	dayOf,
	daysBetween,
	elapsedMs,
	isValidDay,
	isValidZone,
	monthBounds,
	parseLocalDateTime,
	sessionMinutes,
	splitByDay,
	toLocalDateTime,
	weekStart,
} from './index';

const zones = [
	'America/New_York',
	'Europe/London',
	'Asia/Tokyo',
	'Asia/Shanghai',
	'Australia/Lord_Howe',
	'UTC',
] as const;
const zone = fc.constantFrom(...zones);
const instant = fc.integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2040, 11, 31) });
const at = (iso: string) => Date.parse(iso);
const local = (value: string, tz: string) => {
	const parsed = parseLocalDateTime(value, tz);
	if (!parsed.ok) throw new Error(`Invalid test date: ${value}`);
	return parsed.instant;
};

describe('calendar arithmetic', () => {
	it.each([
		['2026-03-08', 'America/New_York', 23],
		['2026-11-01', 'America/New_York', 25],
		['2026-03-09', 'America/New_York', 24],
		['2026-03-08', 'Asia/Tokyo', 24],
		['2026-11-01', 'Asia/Tokyo', 24],
		['2026-04-05', 'Australia/Lord_Howe', 24.5],
		['2026-10-04', 'Australia/Lord_Howe', 23.5],
		['2018-11-04', 'America/Sao_Paulo', 23],
	])('bounds of %s in %s span %s hours', (day, tz, hours) => {
		const { start, end } = dayBounds(day, tz);
		expect(end - start).toBe(hours * 3_600_000);
		expect(dayOf(start, tz)).toBe(day);
		expect(dayOf(end - 1, tz)).toBe(day);
		expect(dayOf(end, tz)).toBe(addDays(day, 1));
	});

	it('does calendar arithmetic over leap days, months and years', () => {
		expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
		expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
		expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
		expect(daysBetween('2024-03-01', '2024-02-28')).toBe(-2);
		expect(monthBounds('2024-02-12')).toEqual({ first: '2024-02-01', last: '2024-02-29' });
		expect(monthBounds('2026-12-31')).toEqual({ first: '2026-12-01', last: '2026-12-31' });
		for (const start of [1, 2, 3, 4, 5, 6, 7] as const) {
			expect(weekStart('2026-11-08', start)).toBe(`2026-11-${String(start + 1).padStart(2, '0')}`);
		}
		expect(weekStart('2026-01-01', 1)).toBe('2025-12-29');
	});

	it('validates days and named zones without accepting fixed offsets', () => {
		for (const tz of zones) expect(isValidZone(tz)).toBe(true);
		for (const tz of ['', 'Mars/Olympus', '+01:00']) expect(isValidZone(tz)).toBe(false);
		for (const day of ['2026-02-29', '2026-13-01', '2026-2-01', '2026-01-01T00:00']) {
			expect(isValidDay(day)).toBe(false);
			expect(() => addDays(day, 1)).toThrow();
		}
		expect(isValidDay('2024-02-29')).toBe(true);
		expect(() => addDays('2026-01-01', 1.5)).toThrow();
	});

	it('contains instants and has touching consecutive bounds (500 property runs)', () => {
		fc.assert(
			fc.property(instant, zone, (t, tz) => {
				const day = dayOf(t, tz);
				const bounds = dayBounds(day, tz);
				expect(bounds.start).toBeLessThanOrEqual(t);
				expect(t).toBeLessThan(bounds.end);
				expect(dayBounds(addDays(day, 1), tz).start).toBe(bounds.end);
				expect(dayBounds(addDays(day, -1), tz).end).toBe(bounds.start);
			}),
			{ numRuns: 500 },
		);
	});
});

describe('session slices', () => {
	it('splits 22:00–02:00, three-day sessions and running sessions', () => {
		const start_at = at('2026-01-01T22:00Z');
		const end_at = at('2026-01-02T02:00Z');
		const expected = [
			{
				day: '2026-01-01',
				start: start_at,
				end: at('2026-01-02T00:00Z'),
				minutes: 120,
				first: true,
				last: false,
			},
			{
				day: '2026-01-02',
				start: at('2026-01-02T00:00Z'),
				end: end_at,
				minutes: 120,
				first: false,
				last: true,
			},
		];
		expect(splitByDay({ start_at, end_at }, 'UTC', 0)).toEqual(expected);
		expect(splitByDay({ start_at, end_at: null }, 'UTC', end_at)).toEqual(expected);
		expect(
			splitByDay({ start_at, end_at: at('2026-01-03T02:00Z') }, 'UTC', 0).map((s) => s.minutes),
		).toEqual([120, 1440, 120]);
	});

	it('floors earlier slices and gives the final slice the exact rounding remainder', () => {
		const slices = splitByDay(
			{ start_at: at('2026-01-01T23:59:30Z'), end_at: at('2026-01-02T00:00:30Z') },
			'UTC',
			0,
		);
		expect(slices.map((s) => s.minutes)).toEqual([0, 1]);
		expect(sessionMinutes(0, 29_999)).toBe(0);
		expect(sessionMinutes(0, 30_000)).toBe(1);
		expect(sessionMinutes(0, 90_000)).toBe(2);
		expect(sessionMinutes(60_000, 0)).toBe(-1);
	});

	it('does not create an empty slice when ending exactly at midnight', () => {
		const slices = splitByDay(
			{ start_at: at('2026-01-01T22:00Z'), end_at: at('2026-01-02T00:00Z') },
			'UTC',
			0,
		);
		expect(slices).toHaveLength(1);
		expect(slices[0]).toMatchObject({ minutes: 120, first: true, last: true });
	});

	it.each([0, -60_000])('represents duration %s with one zero-minute slice', (duration) => {
		expect(splitByDay({ start_at: 60_000, end_at: 60_000 + duration }, 'UTC', 0)).toEqual([
			{ day: '1970-01-01', start: 60_000, end: 60_000, minutes: 0, first: true, last: true },
		]);
		expect(splitByDay({ start_at: 60_000, end_at: null }, 'UTC', 0)[0]?.minutes).toBe(0);
	});

	it.each([
		['2026-03-08T00:00', '2026-03-09T00:00', 'America/New_York', 1380],
		['2026-11-01T00:00', '2026-11-02T00:00', 'America/New_York', 1500],
		['2026-04-05T00:00', '2026-04-06T00:00', 'Australia/Lord_Howe', 1470],
	])('counts actual duration across DST from %s', (start, end, tz, minutes) => {
		expect(
			splitByDay({ start_at: local(start, tz), end_at: local(end, tz) }, tz, 0)[0]?.minutes,
		).toBe(minutes);
	});

	it('re-buckets deterministically in another zone', () => {
		const s = { start_at: at('2026-01-01T22:00Z'), end_at: at('2026-01-02T02:00Z') };
		const utc = splitByDay(s, 'UTC', 0);
		const tokyo = splitByDay(s, 'Asia/Tokyo', 0);
		expect(tokyo).toHaveLength(1);
		expect(tokyo[0]).toMatchObject({ day: '2026-01-02', minutes: 240 });
		expect(splitByDay(s, 'UTC', 0)).toEqual(utc);
		expect(splitByDay(s, 'Asia/Tokyo', 0)).toEqual(tokyo);
	});

	it('preserves minutes, non-negativity, coverage and contiguity (500 property runs)', () => {
		fc.assert(
			fc.property(
				instant,
				fc.integer({ min: 0, max: 7 * 86_400_000 }),
				zone,
				fc.boolean(),
				(start, duration, tz, running) => {
					const end = start + duration;
					const slices = splitByDay({ start_at: start, end_at: running ? null : end }, tz, end);
					expect(slices.reduce((sum, s) => sum + s.minutes, 0)).toBe(sessionMinutes(start, end));
					expect(slices[0]?.start).toBe(start);
					expect(slices.at(-1)?.end).toBe(end);
					for (const [i, slice] of slices.entries()) {
						expect(slice.minutes).toBeGreaterThanOrEqual(0);
						expect(Number.isInteger(slice.minutes)).toBe(true);
						expect(slice.end).toBeGreaterThanOrEqual(slice.start);
						expect(slice.day).toBe(dayOf(slice.start, tz));
						expect(slice.first).toBe(i === 0);
						expect(slice.last).toBe(i === slices.length - 1);
						if (i > 0) expect(slice.start).toBe(slices[i - 1]?.end);
						if (!slice.last)
							expect(slice.minutes).toBe(Math.floor((slice.end - slice.start) / 60_000));
					}
				},
			),
			{ numRuns: 500 },
		);
	});
});

describe('local datetime inputs and elapsed time', () => {
	it('rejects spring gaps and picks the earlier fall-back instant', () => {
		expect(parseLocalDateTime('2026-03-08T02:30', 'America/New_York')).toEqual({
			ok: false,
			reason: 'nonexistent',
		});
		expect(parseLocalDateTime('2026-11-01T01:30', 'America/New_York')).toEqual({
			ok: true,
			instant: at('2026-11-01T05:30Z'),
			ambiguous: true,
		});
		expect(parseLocalDateTime('2026-10-04T02:15', 'Australia/Lord_Howe')).toEqual({
			ok: false,
			reason: 'nonexistent',
		});
		expect(parseLocalDateTime('2026-04-05T01:45', 'Australia/Lord_Howe')).toEqual({
			ok: true,
			instant: at('2026-04-04T14:45Z'),
			ambiguous: true,
		});
	});

	it.each([
		'2026-02-29T12:00',
		'2026-01-01T24:00',
		'2026-01-01T12:60',
		'2026-01-01',
		'2026-01-01T12:00Z',
		'2026-01-01T12:00:30',
		'2026-1-1T01:00',
		'garbage',
	])('rejects invalid input %s', (value) => {
		expect(parseLocalDateTime(value, 'UTC')).toEqual({ ok: false, reason: 'invalid' });
	});

	it('rejects invalid zones, formats minute precision and recomputes elapsed', () => {
		expect(parseLocalDateTime('2026-01-01T12:00', 'invalid')).toEqual({
			ok: false,
			reason: 'invalid',
		});
		expect(toLocalDateTime(at('2026-01-01T23:45:59.999Z'), 'Asia/Tokyo')).toBe('2026-01-02T08:45');
		expect(elapsedMs(1000, 5000)).toBe(4000);
		expect(elapsedMs(1000, 500)).toBe(0);
	});

	it('round-trips the same minute outside ambiguous times (500 property runs)', () => {
		fc.assert(
			fc.property(instant, zone, (t, tz) => {
				const parsed = parseLocalDateTime(toLocalDateTime(t, tz), tz);
				expect(parsed.ok).toBe(true);
				if (parsed.ok && !parsed.ambiguous)
					expect(parsed.instant).toBe(Math.floor(t / 60_000) * 60_000);
			}),
			{ numRuns: 500 },
		);
	});
});
