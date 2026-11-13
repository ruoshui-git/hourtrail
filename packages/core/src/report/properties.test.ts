import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_ACTIVITY_TYPES, WORK_TYPE_ID } from '../schema';
import { addDays, daysBetween, splitByDay } from '../time';
import { report } from './report';
import { statistics } from './statistics';
import {
	CUSTOM_TYPE_ID,
	NOW,
	PLACE_A,
	WORK_ITEM_A,
	WORK_ITEM_B,
	at,
	configFor,
	id,
	place,
	reportData,
	session,
} from './fixtures';

const runs = { numRuns: 500 };
const ZONES = ['America/New_York', 'Asia/Kolkata', 'Australia/Adelaide', 'UTC'] as const;
const TYPE_IDS = [...DEFAULT_ACTIVITY_TYPES.map((t) => t.id), CUSTOM_TYPE_ID];
const WORK_COUNTING = new Set([WORK_TYPE_ID, CUSTOM_TYPE_ID]);
const PLACE_B = id(0x31);
const PLACE_IDS = [PLACE_A, PLACE_B];
const text = fc.oneof(
	fc.string({ maxLength: 16 }),
	fc.constantFrom('库存管理系统开发', '第1寺院', '修复洗手台', '🚀 note'),
);

// Transitions in America/New_York (spring, fall), Asia/Kolkata and Australia/Adelaide midnights.
const ANCHORS = [
	at('2026-03-08T07:00:00Z'),
	at('2026-11-01T06:00:00Z'),
	at('2026-01-01T18:30:00Z'),
	at('2026-04-04T16:30:00Z'),
	at('2026-10-03T16:30:00Z'),
];
const instant = fc.oneof(
	fc.integer({ min: at('2026-02-01T00:00Z'), max: at('2026-12-01T00:00Z') }),
	fc
		.constantFrom(...ANCHORS)
		.chain((anchor) => fc.integer({ min: anchor - 26 * 3_600_000, max: anchor + 26 * 3_600_000 })),
);
type SessionInput = {
	start: number;
	duration: number;
	running: boolean;
	deleted: boolean;
	type: string;
	workItem: string | null;
	place: string | null;
	note: string;
};
type Scenario = {
	zone: (typeof ZONES)[number];
	sessions: SessionInput[];
	from: string;
	length: number;
	groupBy: 'work_item' | 'project' | 'day' | 'type';
	showSessions: boolean;
	showNotes: boolean;
	includeRunning: boolean;
	typeIds: string[] | null;
};

const sessionInput: fc.Arbitrary<SessionInput> = fc.record({
	start: instant,
	duration: fc.oneof(
		fc.integer({ min: 0, max: 6 * 3_600_000 }),
		fc.integer({ min: 0, max: 30 * 3_600_000 }),
	),
	running: fc.integer({ min: 0, max: 9 }).map((n) => n === 0),
	deleted: fc.integer({ min: 0, max: 9 }).map((n) => n === 0),
	type: fc.constantFrom(...TYPE_IDS),
	workItem: fc.constantFrom<string | null>(null, WORK_ITEM_A, WORK_ITEM_B),
	place: fc.constantFrom<string | null>(null, ...PLACE_IDS),
	note: text,
});
const scenario: fc.Arbitrary<Scenario> = fc.record({
	zone: fc.constantFrom(...ZONES),
	sessions: fc.array(sessionInput, { maxLength: 14 }),
	from: fc.integer({ min: 0, max: 280 }).map((offset) => addDays('2026-02-20', offset)),
	length: fc.integer({ min: 1, max: 45 }),
	groupBy: fc.constantFrom('work_item', 'project', 'day', 'type'),
	showSessions: fc.boolean(),
	showNotes: fc.boolean(),
	includeRunning: fc.boolean(),
	typeIds: fc.option(fc.subarray(TYPE_IDS, { minLength: 1 }), { nil: null }),
});

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function build(s: Scenario) {
	const sessions = s.sessions.map((input, index) =>
		session({
			id: id(index + 1),
			type_id: input.type,
			work_item_id: input.workItem,
			place_id: input.place,
			note: input.note,
			start_tz: s.zone,
			start_at: input.start,
			end_at: input.running ? null : input.start + input.duration,
			deleted_at: input.deleted ? 5 : null,
		}),
	);
	const data = reportData({
		sessions,
		settings: { reporting_tz: s.zone, week_start: 1 },
		places: [place({ id: PLACE_A, name: '修复洗手台' }), place({ id: PLACE_B, name: 'B' })],
	});
	return { sessions, data };
}

describe('report identities (500 property runs)', () => {
	it('groups, rows, days and the work split all sum exactly to the same total', () => {
		fc.assert(
			fc.property(scenario, (s) => {
				const { sessions, data } = build(s);
				const to = addDays(s.from, s.length - 1);
				const range = { from: s.from, to };
				const typeFilter = s.typeIds === null ? null : new Set(s.typeIds);
				const cfg = configFor(range, {
					group_by: s.groupBy,
					show_sessions: s.showSessions,
					show_notes: s.showNotes,
					type_ids: s.typeIds,
				});
				const result = report(cfg, data, { now: NOW, includeRunning: s.includeRunning });

				// Independent expectation straight from splitByDay, the History allocation.
				const counted = sessions.filter(
					(x) =>
						x.deleted_at === null &&
						(x.end_at !== null || s.includeRunning) &&
						(typeFilter === null || typeFilter.has(x.type_id)),
				);
				const expected = counted.flatMap((x) =>
					splitByDay(x, s.zone, NOW)
						.filter((slice) => slice.day >= range.from && slice.day <= range.to)
						.map((slice) => ({ ...slice, type: x.type_id })),
				);
				const total = sum(expected.map((slice) => slice.minutes));
				expect(result.total_minutes).toBe(total);
				expect(result.rows).toHaveLength(expected.length);
				expect(sum(result.rows.map((row) => row.minutes))).toBe(total);
				expect(result.rows.every((row) => row.day >= range.from && row.day <= range.to)).toBe(true);
				expect(
					result.rows.every((row) =>
						s.showNotes ? typeof row.note === 'string' : row.note === null,
					),
				).toBe(true);

				// Work hours come from the type id: Work and the custom type count, Overhead and Volunteer do not.
				const workExpected = sum(
					expected.filter((slice) => WORK_COUNTING.has(slice.type)).map((slice) => slice.minutes),
				);
				expect(result.work_minutes).toBe(workExpected);
				expect(result.work_minutes + sum(result.other_minutes.map((o) => o.minutes))).toBe(total);

				expect(sum(result.groups.map((group) => group.minutes))).toBe(total);
				for (const group of result.groups) {
					expect(group.work_minutes + group.other_minutes).toBe(group.minutes);
					if (s.showSessions) {
						expect(group.rows && sum(group.rows.map((row) => row.minutes))).toBe(group.minutes);
					} else {
						expect(group.rows).toBeNull();
					}
				}

				expect(result.days).toHaveLength(daysBetween(range.from, range.to) + 1);
				expect(sum(result.days.map((day) => day.minutes))).toBe(total);
				for (const day of result.days) {
					const dayExpected = sum(
						expected.filter((slice) => slice.day === day.day).map((slice) => slice.minutes),
					);
					expect(day.minutes).toBe(dayExpected);
					expect(sum(day.by_type.map((t) => t.minutes))).toBe(day.minutes);
				}

				for (const value of [
					result.total_minutes,
					result.work_minutes,
					...result.groups.flatMap((g) => [g.minutes, g.work_minutes, g.other_minutes]),
					...result.days.map((d) => d.minutes),
					...result.rows.map((r) => r.minutes),
				]) {
					expect(Number.isInteger(value)).toBe(true);
					expect(value).toBeGreaterThanOrEqual(0);
				}
			}),
			runs,
		);
	});

	it('statistics agrees with an unfiltered report and its bars and breakdowns sum to the total', () => {
		fc.assert(
			fc.property(scenario, (s) => {
				const { sessions, data } = build(s);
				const to = addDays(s.from, s.length - 1);
				const range = { from: s.from, to };
				const options = { now: NOW, includeRunning: s.includeRunning };
				const whole = report(configFor(range, { group_by: 'day' }), data, options);
				const stats = statistics({ kind: 'custom', from: s.from, to }, data, options);

				expect(stats.total_minutes).toBe(whole.total_minutes);
				expect(stats.work_minutes).toBe(whole.work_minutes);
				expect(sum(stats.bars.map((b) => b.minutes))).toBe(stats.total_minutes);
				expect(sum(stats.by_type.map((b) => b.minutes))).toBe(stats.total_minutes);
				expect(sum(stats.by_work_item.map((b) => b.minutes))).toBe(stats.total_minutes);
				expect(sum(stats.by_project.map((b) => b.minutes))).toBe(stats.total_minutes);
				expect(sum(stats.by_place.map((b) => b.minutes))).toBe(stats.total_minutes);
				expect(stats.bar_unit).toBe(daysBetween(s.from, to) + 1 <= 56 ? 'day' : 'week');
				expect(stats.bars.every((b) => b.from >= s.from && b.to <= to)).toBe(true);

				const counted = new Set(
					sessions
						.filter((x) => x.deleted_at === null && (x.end_at !== null || s.includeRunning))
						.filter((x) =>
							splitByDay(x, s.zone, NOW).some((slice) => slice.day >= s.from && slice.day <= to),
						)
						.map((x) => x.id),
				);
				expect(stats.session_count).toBe(counted.size);
				expect(stats.recent.length).toBeLessThanOrEqual(10);
			}),
			runs,
		);
	});
});
