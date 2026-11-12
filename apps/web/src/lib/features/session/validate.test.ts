import { describe, expect, it } from 'vitest';
import { validateSessionTimes, sessionWarnings } from './validate';

describe('session editor validation', () => {
	it('blocks reversed and nonexistent local ranges', () => {
		expect(
			validateSessionTimes('2026-01-01T12:00', '2026-01-01T11:00', 'America/New_York'),
		).toMatchObject({ ok: false, message: 'End must be after start.' });
		expect(validateSessionTimes('2026-03-08T02:30', '', 'America/New_York')).toMatchObject({
			ok: false,
			message: "That time doesn't exist on this day (clocks went forward).",
		});
	});

	it('requires an end time unless the session is already running', () => {
		expect(validateSessionTimes('2026-01-01T12:00', '', 'America/New_York', false)).toMatchObject({
			ok: false,
			field: 'end',
			message: 'Enter an end time for this session.',
		});
		expect(validateSessionTimes('2026-01-01T12:00', '', 'America/New_York', true)).toMatchObject({
			ok: true,
			end: null,
		});
	});

	it('accepts ambiguous fall-back times using the first occurrence', () => {
		expect(
			validateSessionTimes('2026-11-01T01:30', '2026-11-01T02:30', 'America/New_York'),
		).toMatchObject({ ok: true, ambiguousStart: true });
	});

	it('warns for overlapping, long, and future sessions', () => {
		const start = Date.UTC(2026, 0, 1, 10);
		const other = {
			id: 'other',
			deleted_at: null,
			start_at: start + 10 * 60000,
			end_at: start + 30 * 60000,
			work_item_id: null,
		} as never;
		expect(sessionWarnings(start, start + 17 * 3600000, [other], [], null, start - 1)).toEqual([
			'Overlaps another session by 20m',
			'This session is longer than 16 hours.',
			'This session starts in the future.',
		]);
	});
});
