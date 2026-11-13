import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_ACTIVITY_TYPES,
	dayBounds,
	openIssueCount,
	review,
	reviewMarkId,
	splitByDay,
} from '../index';
import type { RecordOf, ReviewInput, ReviewIssue, Session } from '../index';

const minute = 60_000;
const hour = 60 * minute;
const day = '2026-11-12';
const midnight = Date.parse(`${day}T00:00:00Z`);
const at = (hours: number) => midnight + hours * hour;
const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const common = {
	rev: 0,
	created_at: midnight,
	updated_at: midnight,
	updated_by: 'device-a',
	deleted_at: null,
};

function session(changes: Partial<Session> = {}): Session {
	return {
		...common,
		id: id(10),
		work_item_id: id(20),
		type_id: id(1),
		start_at: at(9),
		end_at: at(10),
		start_tz: 'UTC',
		end_tz: 'UTC',
		note: '库存管理系统开发\n修复洗手台',
		source: 'live',
		place_id: null,
		place_state: 'none',
		place_candidates: [],
		origin_device_id: 'device-a',
		flags: {},
		...changes,
	};
}

function input(changes: Partial<ReviewInput> = {}): ReviewInput {
	return {
		sessions: [session()],
		items: [
			{
				...common,
				id: id(20),
				name: '库存管理系统开发',
				description: '修复洗手台',
				type_id: id(2),
				project_id: null,
				place_id: null,
				pinned_at: null,
				pin_sort: 0,
				archived_at: null,
			},
		],
		types: DEFAULT_ACTIVITY_TYPES.map((type) => ({ ...type })),
		places: [
			{
				...common,
				id: id(30),
				name: '第1寺院',
				lat: 0,
				lng: 0,
				radius_m: 100,
				description: '',
				archived_at: null,
			},
		],
		conflicts: [],
		marks: [],
		settings: { long_gap_min: 60, long_session_min: 600, note_prompt: 'work' },
		tz: 'UTC',
		now: at(20),
		formatTime: (ms) => new Date(ms).toISOString().slice(11, 16),
		...changes,
	};
}

function conflict(changes: Partial<RecordOf<'conflict'>> = {}): RecordOf<'conflict'> {
	return {
		...common,
		id: id(40),
		entity: 'session',
		record_id: id(10),
		field: 'end_at',
		kept_value: at(10),
		other_value: at(11),
		kept_device: 'device-a',
		other_device: 'device-b',
		at: at(12),
		resolved_at: null,
		...changes,
	};
}

function mark(
	key: string,
	state: 'reviewed' | 'dismissed',
	changes: Partial<RecordOf<'review_mark'>> = {},
): RecordOf<'review_mark'> {
	return { ...common, id: reviewMarkId(day, key), day, issue_key: key, state, ...changes };
}

const ofKind = (data: ReviewInput, kind: ReviewIssue['kind'], date = day) =>
	review(date, data).filter((issue) => issue.kind === kind);

describe('daily review rules', () => {
	it('returns no issues for a complete session or an empty day', () => {
		expect(review(day, input())).toEqual([]);
		expect(review(day, input({ sessions: [] }))).toEqual([]);
		expect(openIssueCount([])).toBe(0);
	});

	it('reports running-long only strictly past the configured threshold', () => {
		const data = input({ sessions: [session({ end_at: null })], now: at(19) });
		expect(ofKind(data, 'running-long')).toEqual([]);
		data.now++;
		expect(ofKind(data, 'running-long')).toEqual([
			expect.objectContaining({
				key: `running-long:${id(10)}`,
				severity: 'caution',
				message: 'Running for 10h 00m',
				session_ids: [id(10)],
				state: 'open',
			}),
		]);
		data.sessions[0]!.end_at = data.now;
		expect(ofKind(data, 'running-long')).toEqual([]);
		data.sessions[0]!.end_at = null;
		data.settings.long_session_min = 601;
		expect(ofKind(data, 'running-long')).toEqual([]);
	});

	it('reports one two-running issue with all active sessions on this day', () => {
		const data = input({
			sessions: [
				session({ id: id(12), start_at: at(11), end_at: null }),
				session({ id: id(11), start_at: at(10), end_at: null }),
				session({ end_at: null }),
				session({ id: id(13), start_at: at(25), end_at: null }),
				session({ id: id(14), end_at: null, deleted_at: at(12) }),
			],
		});
		expect(ofKind(data, 'two-running')).toEqual([
			expect.objectContaining({
				key: 'two-running',
				session_ids: [id(10), id(11), id(12)],
				start: at(9),
				severity: 'caution',
			}),
		]);
		expect(ofKind(input({ sessions: [session({ end_at: null })] }), 'two-running')).toEqual([]);
	});

	it('identifies untitled by null item id and uses injected time formatting', () => {
		const data = input({
			sessions: [session({ work_item_id: null, end_at: at(10.25) })],
			formatTime: (ms) => (ms === at(9) ? '9:00 AM' : '10:15 AM'),
		});
		expect(ofKind(data, 'untitled')[0]).toMatchObject({
			key: `untitled:${id(10)}`,
			message: 'Untitled session, 9:00 AM–10:15 AM',
			severity: 'neutral',
			start: at(9),
			end: at(10.25),
		});
		expect(ofKind(input({ items: [] }), 'untitled')).toEqual([]);
	});

	it.each([
		['work', id(1), true],
		['work', id(2), false],
		['work', id(99), false],
		['all', id(2), true],
		['all', id(99), true],
		['none', id(1), false],
	] as const)('covers note_prompt %s and type %s: %s', (prompt, type_id, expected) => {
		const data = input({ sessions: [session({ note: '', type_id })] });
		data.settings.note_prompt = prompt;
		// Session type is independent of the item's type and the type's display name.
		data.types[0]!.name = 'Personal';
		data.types[1]!.name = 'Work';
		expect(ofKind(data, 'no-note')).toHaveLength(expected ? 1 : 0);
	});

	it('requires an empty note and at least 15 actual minutes, including running sessions', () => {
		const data = input({ sessions: [session({ note: '', end_at: at(9) + 15 * minute })] });
		expect(ofKind(data, 'no-note')[0]).toMatchObject({
			key: `no-note:${id(10)}`,
			message: 'No note',
			severity: 'neutral',
		});
		data.sessions[0]!.end_at!--;
		expect(ofKind(data, 'no-note')).toEqual([]);
		data.sessions[0]!.end_at = null;
		data.now = at(9) + 15 * minute;
		expect(ofKind(data, 'no-note')).toHaveLength(1);
		data.sessions[0]!.note = '修复洗手台';
		expect(ofKind(data, 'no-note')).toEqual([]);
	});

	it.each(['none', 'pending', 'set', 'suggested', 'ambiguous', 'unresolved', 'dismissed'] as const)(
		'checks place state %s',
		(place_state) => {
			const issues = ofKind(input({ sessions: [session({ place_state })] }), 'place');
			expect(issues).toHaveLength(
				['suggested', 'ambiguous', 'unresolved'].includes(place_state) ? 1 : 0,
			);
			if (issues.length) {
				expect(issues[0]).toMatchObject({ key: `place:${id(10)}`, severity: 'neutral' });
			}
		},
	);

	it('reports positive overlaps with stable pair keys and excludes touching sessions', () => {
		const a = session();
		const b = session({ id: id(11), start_at: at(9.5), end_at: at(11) });
		const c = session({ id: id(12), start_at: at(11), end_at: at(12) });
		expect(ofKind(input({ sessions: [c, b, a] }), 'overlap')).toEqual([
			expect.objectContaining({
				key: `overlap:${a.id}:${b.id}`,
				session_ids: [a.id, b.id],
				start: at(9.5),
				end: at(10),
				message: 'Sessions overlap by 30m',
				severity: 'caution',
			}),
		]);
	});

	it.each([
		[{ start_at: at(0), end_at: at(16) }, false],
		[{ start_at: at(0), end_at: at(16) + 1 }, true],
		[{ start_at: at(20), end_at: at(21) }, false],
		[{ start_at: at(20) + 1, end_at: at(21) }, true],
		[{ start_at: at(10), end_at: at(9) }, true],
		[{ start_at: at(10), end_at: at(10) }, false],
		[{ flags: { clock_suspect: true } }, true],
		[{ start_at: at(0), end_at: null }, true],
	] as const)('checks suspicious times %j → %s', (changes, expected) => {
		const issues = ofKind(input({ sessions: [session(changes)] }), 'suspect-time');
		expect(issues).toHaveLength(expected ? 1 : 0);
		if (expected) {
			expect(issues[0]).toMatchObject({ key: `suspect-time:${id(10)}`, severity: 'caution' });
		}
	});

	it('reports exact-threshold gaps only between sessions, without inferring work', () => {
		const data = input({
			sessions: [session(), session({ id: id(11), start_at: at(11), end_at: at(12) })],
		});
		expect(ofKind(data, 'gap')).toEqual([
			expect.objectContaining({
				key: `gap:${day}:${at(10)}`,
				start: at(10),
				end: at(11),
				session_ids: [],
				message: '1h 00m not recorded, 10:00–11:00',
				severity: 'neutral',
			}),
		]);
		data.sessions[1]!.start_at--;
		expect(ofKind(data, 'gap')).toEqual([]);
		data.settings.long_gap_min = 30;
		expect(ofKind(data, 'gap')).toHaveLength(1);
		expect(ofKind(input(), 'gap')).toEqual([]);
	});

	it('uses the interval union and now for gaps around nested and running sessions', () => {
		const data = input({
			sessions: [
				session({ start_at: at(8), end_at: at(12) }),
				session({ id: id(11), start_at: at(9), end_at: at(10) }),
				session({ id: id(12), start_at: at(13), end_at: null }),
				session({ id: id(13), start_at: at(15), end_at: at(16) }),
			],
			now: at(14),
		});
		expect(ofKind(data, 'gap').map(({ start, end }) => [start, end])).toEqual([
			[at(12), at(13)],
			[at(14), at(15)],
		]);
		data.now = at(16);
		expect(ofKind(data, 'gap').map(({ start, end }) => [start, end])).toEqual([[at(12), at(13)]]);
	});

	it('reports each unresolved session conflict by conflict id, excluding unrelated records', () => {
		const data = input({
			conflicts: [
				conflict(),
				conflict({ id: id(41), field: 'start_at' }),
				conflict({ id: id(42), resolved_at: at(13) }),
				conflict({ id: id(43), deleted_at: at(13) }),
				conflict({ id: id(44), entity: 'work_item' }),
				conflict({ id: id(45), record_id: id(99) }),
			],
		});
		expect(ofKind(data, 'conflict').map(({ key }) => key)).toEqual([
			`conflict:${id(40)}`,
			`conflict:${id(41)}`,
		]);
		expect(ofKind(data, 'conflict')[0]).toMatchObject({
			session_ids: [id(10)],
			severity: 'caution',
		});
		data.sessions[0]!.deleted_at = at(13);
		expect(review(day, data)).toEqual([]);
	});

	it('applies live marks for this day and key, and counts only open issues', () => {
		const data = input({
			sessions: [
				session({
					work_item_id: null,
					note: '',
					place_state: 'unresolved',
					flags: { clock_suspect: true },
				}),
			],
			marks: [
				mark(`untitled:${id(10)}`, 'reviewed'),
				mark(`no-note:${id(10)}`, 'dismissed'),
				mark(`place:${id(10)}`, 'reviewed', { deleted_at: at(12) }),
				mark(`suspect-time:${id(10)}`, 'reviewed', {
					day: '2026-11-11',
					id: reviewMarkId('2026-11-11', `suspect-time:${id(10)}`),
				}),
				mark('unrelated', 'reviewed'),
			],
		});
		const issues = review(day, data);
		expect(issues.map(({ state }) => state)).toEqual(['reviewed', 'dismissed', 'open', 'open']);
		expect(openIssueCount(issues)).toBe(2);
	});

	it('reviews midnight-crossing sessions on both days with the same session keys and day-specific marks', () => {
		const s = session({ start_at: at(-0.25), end_at: at(0.25), work_item_id: null, note: '' });
		const data = input({ sessions: [s], marks: [mark(`untitled:${s.id}`, 'reviewed')] });
		const before = structuredClone({ ...data, formatTime: undefined });
		for (const date of ['2026-11-11', day]) {
			const issues = review(date, data);
			expect(issues.map(({ key }) => key)).toEqual([`untitled:${s.id}`, `no-note:${s.id}`]);
			expect(new Set(issues.map(({ key }) => key)).size).toBe(issues.length);
			expect(issues[0]!.state).toBe(date === day ? 'reviewed' : 'open');
		}
		expect({ ...data, formatTime: undefined }).toEqual(before);
		expect(ofKind(data, 'untitled')[0]).toMatchObject({ start: midnight, end: at(0.25) });
		s.end_at = midnight;
		expect(review(day, data)).toEqual([]);
	});

	it('uses reporting-zone slices and elapsed time on a 25-hour DST day', () => {
		const date = '2026-11-01';
		const tz = 'America/New_York';
		const bounds = dayBounds(date, tz);
		expect(bounds.end - bounds.start).toBe(25 * hour);
		const data = input({
			tz,
			now: bounds.end,
			sessions: [
				session({ start_at: bounds.start - hour, end_at: bounds.start + hour, work_item_id: null }),
				session({ id: id(11), start_at: bounds.end - hour, end_at: bounds.end + hour }),
			],
		});
		expect(ofKind(data, 'gap', date)[0]).toMatchObject({
			start: bounds.start + hour,
			end: bounds.end - hour,
			message: expect.stringContaining('23h 00m not recorded'),
		});
		expect(ofKind(data, 'untitled', date)[0]!.start).toBe(bounds.start);
	});

	it('clips overlap bounds to the reviewed day and orders equal-start pairs by id', () => {
		const data = input({
			sessions: [
				session({ id: id(11), start_at: at(-2), end_at: at(2) }),
				session({ start_at: at(-2), end_at: at(1) }),
			],
		});
		expect(ofKind(data, 'overlap')[0]).toMatchObject({
			key: `overlap:${id(10)}:${id(11)}`,
			start: midnight,
			end: at(1),
		});
	});

	it('sorts by first time then SPEC table order, with neutral wording for every kind', () => {
		const data = input({
			sessions: [
				session({
					start_at: at(0),
					end_at: null,
					work_item_id: null,
					note: '',
					place_state: 'unresolved',
				}),
				session({ id: id(11), start_at: at(0), end_at: null }),
				session({ id: id(12), start_at: at(22), end_at: at(23), work_item_id: null }),
			],
			conflicts: [conflict()],
		});
		const issues = review(day, data);
		expect(issues.map(({ kind }) => kind)).toEqual([
			'running-long',
			'running-long',
			'two-running',
			'untitled',
			'no-note',
			'place',
			'overlap',
			'suspect-time',
			'suspect-time',
			'conflict',
			'gap',
			'untitled',
			'suspect-time',
		]);
		for (const issue of issues) {
			expect(issue.message).not.toMatch(/missing work|!/i);
			expect(issue.severity).toBe(
				['running-long', 'two-running', 'overlap', 'suspect-time', 'conflict'].includes(issue.kind)
					? 'caution'
					: 'neutral',
			);
		}
	});
});

const randomInput = fc
	.record({
		sessions: fc.array(
			fc.record({
				start: fc.integer({ min: -12 * 60, max: 36 * 60 }),
				length: fc.option(fc.integer({ min: -60, max: 30 * 60 }), { nil: null }),
				deleted: fc.boolean(),
				untitled: fc.boolean(),
				note: fc.constantFrom('', '库存管理系统开发', '第1寺院', '修复洗手台'),
				place_state: fc.constantFrom('none', 'unresolved', 'ambiguous', 'suggested', 'dismissed'),
				clock_suspect: fc.boolean(),
				type: fc.integer({ min: 1, max: 4 }),
			}),
			{ maxLength: 15 },
		),
		long_gap_min: fc.integer({ min: 1, max: 120 }),
		note_prompt: fc.constantFrom('work', 'all', 'none'),
	})
	.map(({ sessions, long_gap_min, note_prompt }) =>
		input({
			sessions: sessions.map((s, i) =>
				session({
					id: id(100 + i),
					start_at: midnight + s.start * minute,
					end_at: s.length === null ? null : midnight + (s.start + s.length) * minute,
					deleted_at: s.deleted ? at(12) : null,
					work_item_id: s.untitled ? null : id(20),
					note: s.note,
					place_state: s.place_state,
					flags: { clock_suspect: s.clock_suspect },
					type_id: id(s.type),
				}),
			),
			settings: { long_gap_min, long_session_min: 600, note_prompt },
			conflicts: sessions.map((_, i) => conflict({ id: id(200 + i), record_id: id(100 + i) })),
			marks: sessions.flatMap((_, i) => [
				mark(`untitled:${id(100 + i)}`, 'reviewed'),
				mark(`conflict:${id(200 + i)}`, 'dismissed'),
			]),
		}),
	);

describe('review properties (500 runs each)', () => {
	it('issue keys are unique per day', () => {
		fc.assert(
			fc.property(randomInput, (data) => {
				const issues = review(day, data);
				expect(new Set(issues.map(({ key }) => key)).size).toBe(issues.length);
			}),
			{ numRuns: 500 },
		);
	});

	it('is deterministic for shuffled input arrays', () => {
		const shuffled = randomInput.chain((data) => {
			const shuffle = <T>(values: T[]) =>
				fc.shuffledSubarray(values, { minLength: values.length, maxLength: values.length });
			return fc
				.tuple(
					shuffle(data.sessions),
					shuffle(data.items),
					shuffle(data.types),
					shuffle(data.places),
					shuffle(data.conflicts),
					shuffle(data.marks),
				)
				.map(([sessions, items, types, places, conflicts, marks]) => ({
					data,
					shuffled: { ...data, sessions, items, types, places, conflicts, marks },
				}));
		});
		fc.assert(
			fc.property(shuffled, ({ data, shuffled }) => {
				expect(review(day, shuffled)).toEqual(review(day, data));
			}),
			{ numRuns: 500 },
		);
	});

	it('every gap is bounded by day sessions, contains no recorded time and meets the threshold', () => {
		fc.assert(
			fc.property(randomInput, (data) => {
				const slices = data.sessions
					.filter((s) => s.deleted_at === null)
					.flatMap((s) => splitByDay(s, data.tz, data.now))
					.filter((slice) => slice.day === day);
				for (const gap of ofKind(data, 'gap')) {
					expect(gap.end! - gap.start!).toBeGreaterThanOrEqual(data.settings.long_gap_min * minute);
					expect(slices.some((slice) => slice.end === gap.start)).toBe(true);
					expect(slices.some((slice) => slice.start === gap.end)).toBe(true);
					expect(slices.some((slice) => slice.end > gap.start! && slice.start < gap.end!)).toBe(
						false,
					);
				}
			}),
			{ numRuns: 500 },
		);
	});
});
