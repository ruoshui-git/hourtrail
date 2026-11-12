import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { findOverlaps, planMerge, planSplit, sessionMinutes } from '../index';
import type { Overlap, Session, SessionPlan } from '../index';

const minute = 60_000;
const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;

function session(overrides: Partial<Session> = {}): Session {
	return {
		id: id(10),
		rev: 3,
		created_at: 100,
		updated_at: 200,
		updated_by: 'device-b',
		deleted_at: null,
		work_item_id: id(20),
		type_id: id(1),
		start_at: 0,
		end_at: 10 * minute,
		start_tz: 'America/Halifax',
		end_tz: 'Asia/Shanghai',
		note: '库存管理系统开发\n修复洗手台',
		source: 'live',
		place_id: id(30),
		place_state: 'suggested',
		place_candidates: [id(30)],
		origin_device_id: 'device-a',
		flags: { clock_suspect: true },
		...overrides,
	};
}

// Apply only the user fields, supplying common metadata as the repository would.
function applyPlan(records: Session[], plan: SessionPlan): Session[] {
	return [
		...records
			.filter((s) => !plan.remove.includes(s.id))
			.map((s) => ({ ...s, ...plan.update.find((update) => update.id === s.id)?.changes })),
		...plan.create.map((fields) => ({ ...session(), ...fields })),
	];
}

describe('planSplit', () => {
	it.each(['live', 'manual'] as const)(
		'splits %s sessions without copying sync metadata',
		(source) => {
			const original = session({ source });
			const before = structuredClone(original);
			const newId = vi.fn(() => id(11));
			const result = planSplit(original, 4 * minute, newId);
			expect(result).toEqual({
				ok: true,
				plan: {
					create: [
						{
							id: id(11),
							work_item_id: original.work_item_id,
							type_id: original.type_id,
							start_at: 4 * minute,
							end_at: original.end_at,
							start_tz: original.start_tz,
							end_tz: original.end_tz,
							note: '',
							source,
							place_id: original.place_id,
							place_state: original.place_state,
							place_candidates: original.place_candidates,
							origin_device_id: original.origin_device_id,
							flags: original.flags,
						},
					],
					update: [{ id: original.id, changes: { end_at: 4 * minute } }],
					remove: [],
				},
			});
			expect(newId).toHaveBeenCalledExactlyOnceWith();
			expect(original).toEqual(before);
			if (!result.ok) throw new Error(result.error);
			const [first, second] = applyPlan([original], result.plan);
			expect(first).toEqual({ ...original, end_at: 4 * minute });
			expect(second!.note).toBe('');
		},
	);

	it('allows exactly one minute from either end, including a two-minute session', () => {
		for (const at of [minute, 9 * minute]) {
			expect(planSplit(session(), at, () => id(11)).ok).toBe(true);
		}
		expect(planSplit(session({ end_at: 2 * minute }), minute, () => id(11)).ok).toBe(true);
	});

	it.each([
		[-1, 'outside'],
		[0, 'outside'],
		[10 * minute, 'outside'],
		[10 * minute + 1, 'outside'],
		[minute - 1, 'too-close'],
		[9 * minute + 1, 'too-close'],
	] as const)('rejects split at %i with %s without generating an id', (at, error) => {
		const newId = vi.fn(() => id(11));
		expect(planSplit(session(), at, newId)).toEqual({ ok: false, error });
		expect(newId).not.toHaveBeenCalled();
	});

	it('rejects running sessions and sessions too short to split', () => {
		const newId = vi.fn(() => id(11));
		expect(planSplit(session({ end_at: null }), minute, newId)).toEqual({
			ok: false,
			error: 'running',
		});
		expect(planSplit(session({ end_at: 2 * minute - 1 }), minute, newId)).toEqual({
			ok: false,
			error: 'too-close',
		});
		expect(newId).not.toHaveBeenCalled();
	});

	it('carries untitled sessions and absent places through unchanged', () => {
		const original = session({
			work_item_id: null,
			place_id: null,
			place_state: 'none',
			place_candidates: [],
			end_tz: null,
		});
		const result = planSplit(original, minute, () => id(11));
		if (!result.ok) throw new Error(result.error);
		expect(result.plan.create[0]).toMatchObject({
			work_item_id: null,
			place_id: null,
			place_state: 'none',
			place_candidates: [],
			end_tz: null,
		});
	});
});

describe('planMerge', () => {
	it('keeps the earlier session in either argument order and reports a gap', () => {
		const earlier = session({ note: '库存管理系统开发' });
		const later = session({
			id: id(11),
			start_at: 12 * minute,
			end_at: 20 * minute,
			note: '修复洗手台',
		});
		const before = structuredClone([earlier, later]);
		const expected = {
			ok: true,
			gapMs: 2 * minute,
			plan: {
				create: [],
				update: [
					{
						id: earlier.id,
						changes: {
							start_at: 0,
							end_at: 20 * minute,
							note: '库存管理系统开发\n修复洗手台',
							place_id: earlier.place_id,
							place_state: earlier.place_state,
							place_candidates: earlier.place_candidates,
						},
					},
				],
				remove: [later.id],
			},
		};
		expect(planMerge(earlier, later)).toEqual(expected);
		expect(planMerge(later, earlier)).toEqual(expected);
		expect([earlier, later]).toEqual(before);
	});

	it.each([
		[10 * minute, 20 * minute],
		[5 * minute, 15 * minute],
		[2 * minute, 4 * minute],
	])('merges touching, overlapping or contained intervals (%i, %i)', (start_at, end_at) => {
		const result = planMerge(session(), session({ id: id(11), start_at, end_at }));
		if (!result.ok) throw new Error(result.error);
		expect(result.gapMs).toBe(0);
		expect(result.plan.update[0]!.changes).toMatchObject({
			start_at: 0,
			end_at: Math.max(10 * minute, end_at),
		});
	});

	it('breaks equal-start ties by id and permits two untitled sessions', () => {
		const a = session({ work_item_id: null });
		const b = session({ id: id(11), work_item_id: null, end_at: 20 * minute });
		const result = planMerge(b, a);
		if (!result.ok) throw new Error(result.error);
		expect(result.plan.update[0]!.id).toBe(a.id);
		expect(result.plan.remove).toEqual([b.id]);
	});

	it.each([
		['', '', ''],
		['', '修复洗手台', '修复洗手台'],
		['库存管理系统开发', '', '库存管理系统开发'],
		['第1寺院', '第1寺院', '第1寺院'],
		['  第1寺院\n', '修复洗手台  ', '  第1寺院\n\n修复洗手台  '],
	])('joins notes without altering Unicode or whitespace (%j, %j)', (noteA, noteB, expected) => {
		const result = planMerge(
			session({ note: noteA }),
			session({ id: id(11), start_at: minute, note: noteB }),
		);
		if (!result.ok) throw new Error(result.error);
		expect(result.plan.update[0]!.changes.note).toBe(expected);
	});

	it.each([true, false])(
		'keeps all place fields from the earlier session when it has a place: %s',
		(hasPlace) => {
			const earlier = session(
				hasPlace ? {} : { place_id: null, place_state: 'none', place_candidates: [] },
			);
			const later = session({
				id: id(11),
				start_at: minute,
				place_id: id(31),
				place_state: 'set',
				place_candidates: [],
			});
			const result = planMerge(later, earlier);
			if (!result.ok) throw new Error(result.error);
			const chosen = hasPlace ? earlier : later;
			expect(result.plan.update[0]!.changes).toMatchObject({
				place_id: chosen.place_id,
				place_state: chosen.place_state,
				place_candidates: chosen.place_candidates,
			});
		},
	);

	it('retains the earlier place when the later has none and handles neither having a place', () => {
		for (const earlier of [session(), session({ place_id: null, place_state: 'none' })]) {
			const result = planMerge(
				earlier,
				session({
					id: id(11),
					start_at: minute,
					place_id: null,
					place_state: 'none',
					place_candidates: [],
				}),
			);
			if (!result.ok) throw new Error(result.error);
			expect(result.plan.update[0]!.changes.place_id).toBe(earlier.place_id);
		}
	});

	it.each([
		[{ id: id(10) }, 'same'],
		[{ end_at: null }, 'running'],
		[{ work_item_id: id(21) }, 'different-item'],
		[{ work_item_id: null }, 'different-item'],
		[{ type_id: id(2) }, 'different-type'],
	] as const)('rejects incompatible sessions with %s → %s', (changes, error) => {
		const a = session();
		const b = session({ id: id(11), ...changes });
		expect(planMerge(a, b)).toEqual({ ok: false, error });
		expect(planMerge(b, a)).toEqual({ ok: false, error });
	});
});

describe('findOverlaps', () => {
	it('finds every pair including nesting, orders ties by id, and rounds minutes', () => {
		const sessions = [
			session({ id: id(12), start_at: minute, end_at: 2 * minute + 30_000 }),
			session({ id: id(11), start_at: minute, end_at: 3 * minute }),
			session(),
		];
		const before = structuredClone(sessions);
		expect(findOverlaps(sessions, 0)).toEqual([
			{ a: id(10), b: id(11), start: minute, end: 3 * minute, minutes: 2 },
			{ a: id(10), b: id(12), start: minute, end: 2 * minute + 30_000, minutes: 2 },
			{ a: id(11), b: id(12), start: minute, end: 2 * minute + 30_000, minutes: 2 },
		]);
		expect(sessions).toEqual(before);
	});

	it('ignores tombstones, reversed and empty ranges, and excludes touching intervals', () => {
		expect(
			findOverlaps(
				[
					session(),
					session({ id: id(11), start_at: 10 * minute, end_at: 20 * minute }),
					session({ id: id(12), deleted_at: 0 }),
					session({ id: id(13), start_at: 5 * minute, end_at: minute }),
					session({ id: id(14), start_at: minute, end_at: minute }),
				],
				0,
			),
		).toEqual([]);
		expect(findOverlaps([], 0)).toEqual([]);
		expect(findOverlaps([session()], 0)).toEqual([]);
	});

	it('ends running sessions at now, including two running sessions and future starts', () => {
		const a = session({ end_at: null });
		const b = session({ id: id(11), start_at: minute, end_at: null });
		expect(findOverlaps([b, a], 2 * minute)).toEqual([
			{ a: a.id, b: b.id, start: minute, end: 2 * minute, minutes: 1 },
		]);
		expect(findOverlaps([a, b], minute)).toEqual([]);
		expect(findOverlaps([session(), b], 2 * minute)[0]!.end).toBe(2 * minute);
		expect(findOverlaps([session(), b], 0)).toEqual([]);
	});

	it('reports positive sub-minute overlaps even when rounded minutes are zero', () => {
		expect(findOverlaps([session(), session({ id: id(11), end_at: 1 })], 0)).toEqual([
			{ a: id(10), b: id(11), start: 0, end: 1, minutes: 0 },
		]);
	});
});

const runs = { numRuns: 500 };
const text = fc.oneof(fc.string(), fc.constantFrom('库存管理系统开发', '第1寺院', '修复洗手台'));
const splittable = fc
	.record({
		start: fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
		first: fc.integer({ min: minute, max: 10_000_000 }),
		second: fc.integer({ min: minute, max: 10_000_000 }),
		note: text,
		work_item_id: fc.option(fc.integer({ min: 20, max: 25 }).map(id), { nil: null }),
		type_id: fc.integer({ min: 1, max: 4 }).map(id),
	})
	.map(({ start, first, second, ...fields }) => ({
		original: session({ ...fields, start_at: start, end_at: start + first + second }),
		at: start + first,
	}));

function splitParts(original: Session, at: number): Session[] {
	const split = planSplit(original, at, () => id(11));
	if (!split.ok) throw new Error(split.error);
	return applyPlan([original], split.plan);
}

describe('session properties (500 runs each)', () => {
	it('split then merge restores the span, work item, type and note', () => {
		fc.assert(
			fc.property(splittable, ({ original, at }) => {
				const parts = splitParts(original, at);
				const merge = planMerge(parts[1]!, parts[0]!);
				if (!merge.ok) throw new Error(merge.error);
				expect(merge.gapMs).toBe(0);
				expect(applyPlan(parts, merge.plan)).toEqual([original]);
			}),
			runs,
		);
	});

	it('split parts cover exactly the original interval without a gap or overlap', () => {
		fc.assert(
			fc.property(splittable, ({ original, at }) => {
				const [first, second] = splitParts(original, at) as [Session, Session];
				expect(first.start_at).toBe(original.start_at);
				expect(first.end_at).toBe(at);
				expect(second.start_at).toBe(at);
				expect(second.end_at).toBe(original.end_at);
				expect(findOverlaps([first, second], 0)).toEqual([]);
			}),
			runs,
		);
	});

	it('conserves duration and total minutes within independent per-part rounding', () => {
		fc.assert(
			fc.property(splittable, ({ original, at }) => {
				const parts = splitParts(original, at);
				const duration = parts.reduce((total, s) => total + s.end_at! - s.start_at, 0);
				const minutes = parts.reduce(
					(total, s) => total + sessionMinutes(s.start_at, s.end_at!),
					0,
				);
				expect(duration).toBe(original.end_at! - original.start_at);
				expect(
					Math.abs(minutes - sessionMinutes(original.start_at, original.end_at!)),
				).toBeLessThanOrEqual(1);
			}),
			runs,
		);
	});

	it('overlaps equal a quadratic reference for random stopped, running and deleted sessions', () => {
		const instant = fc.integer({ min: -5 * minute, max: 5 * minute });
		const randomSessions = fc
			.array(
				fc.record({
					start_at: instant,
					end_at: fc.option(instant, { nil: null }),
					deleted_at: fc.option(instant, { nil: null }),
				}),
				{ maxLength: 40 },
			)
			.map((records) => records.map((s, i) => session({ ...s, id: id(i + 10) })));
		const canonical = (overlaps: Overlap[]) =>
			overlaps.sort((a, b) => a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
		fc.assert(
			fc.property(randomSessions, instant, (sessions, now) => {
				const reference: Overlap[] = [];
				for (let i = 0; i < sessions.length; i++) {
					for (let j = i + 1; j < sessions.length; j++) {
						const pair = [sessions[i]!, sessions[j]!].sort(
							(a, b) => a.start_at - b.start_at || a.id.localeCompare(b.id),
						);
						const [a, b] = pair as [Session, Session];
						if (a.deleted_at !== null || b.deleted_at !== null) continue;
						const start = Math.max(a.start_at, b.start_at);
						const end = Math.min(a.end_at ?? now, b.end_at ?? now);
						if (end > start)
							reference.push({
								a: a.id,
								b: b.id,
								start,
								end,
								minutes: Math.round((end - start) / minute),
							});
					}
				}
				expect(canonical(findOverlaps(sessions, now))).toEqual(canonical(reference));
				expect(findOverlaps([...sessions].reverse(), now)).toEqual(findOverlaps(sessions, now));
			}),
			runs,
		);
	});
});
