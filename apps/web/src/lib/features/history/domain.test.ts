import { dayBounds, DEFAULT_ACTIVITY_TYPES, parseLocalDateTime } from '@hourtrail/core';
import type { RecordOf } from '@hourtrail/core';
import { describe, expect, it } from 'vitest';
import { buildDay } from './domain';

const HOUR = 3_600_000;
const zone = 'America/New_York';
function makeSession(start_at: number, end_at: number | null, id = 'session'): RecordOf<'session'> {
	return {
		id,
		rev: 1,
		updated_by: 'test',
		created_at: start_at,
		updated_at: start_at,
		deleted_at: null,
		work_item_id: null,
		type_id: DEFAULT_ACTIVITY_TYPES[0]!.id,
		start_at,
		end_at,
		start_tz: zone,
		end_tz: end_at === null ? null : zone,
		note: '',
		source: 'manual',
		place_id: null,
		place_state: 'none',
		place_candidates: [],
		origin_device_id: 'test',
		flags: {},
	};
}

describe('buildDay', () => {
	it('allocates a midnight crossing across days without double counting', () => {
		const first = dayBounds('2026-11-11', zone).start + 22 * HOUR;
		const session = makeSession(first, first + 4 * HOUR);
		const types = [...DEFAULT_ACTIVITY_TYPES];
		const yesterday = buildDay('2026-11-11', zone, [session], [], types, [], {}, first + 5 * HOUR);
		const today = buildDay('2026-11-12', zone, [session], [], types, [], {}, first + 5 * HOUR);
		expect(yesterday.rows).toMatchObject([{ continuesNextDay: true, durationLabel: '2h 00m' }]);
		expect(today.rows).toMatchObject([{ continuesFromPreviousDay: true, durationLabel: '2h 00m' }]);
		expect(yesterday.totals.work + today.totals.work).toBe(240);
	});

	it('uses local tick times and real 23 and 25 hour DST bounds', () => {
		const spring = buildDay('2026-03-08', zone, [], [], [...DEFAULT_ACTIVITY_TYPES], [], {}, 0);
		const fall = buildDay('2026-11-01', zone, [], [], [...DEFAULT_ACTIVITY_TYPES], [], {}, 0);
		expect(spring.dayEnd - spring.dayStart).toBe(23 * HOUR);
		expect(fall.dayEnd - fall.dayStart).toBe(25 * HOUR);
		expect(spring.ticks.map((tick) => tick.at)).toContain(
			(parseLocalDateTime('2026-03-08T06:00', zone) as { ok: true; instant: number }).instant,
		);
		expect(fall.ticks.map((tick) => tick.at)).toContain(
			(parseLocalDateTime('2026-11-01T06:00', zone) as { ok: true; instant: number }).instant,
		);
	});

	it('shows only qualifying gaps between sessions and clips a running slice at now', () => {
		const bounds = dayBounds('2026-11-12', zone);
		const sessions = [
			makeSession(bounds.start + 8 * HOUR, bounds.start + 9 * HOUR, 'a'),
			makeSession(bounds.start + 10 * HOUR, null, 'b'),
		];
		const result = buildDay(
			'2026-11-12',
			zone,
			sessions,
			[],
			[...DEFAULT_ACTIVITY_TYPES],
			[],
			{ long_gap_min: 60 },
			bounds.start + 10.5 * HOUR,
		);
		expect(result.rows.filter((row) => row.kind === 'gap')).toHaveLength(1);
		expect(result.rows.at(-1)).toMatchObject({ running: true, durationLabel: '30m' });
		const hidden = buildDay(
			'2026-11-12',
			zone,
			sessions,
			[],
			[...DEFAULT_ACTIVITY_TYPES],
			[],
			{ long_gap_min: 61 },
			bounds.start + 10.5 * HOUR,
		);
		expect(hidden.rows.filter((row) => row.kind === 'gap')).toHaveLength(0);
	});
});
