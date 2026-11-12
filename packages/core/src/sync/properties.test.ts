import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { schemas } from '../schema';
import type { WorkItem } from '../schema';
import { applyMutation, replay } from './apply';
import type { AnyRecord, ApplyContext } from './apply';
import { invertMutation } from './mutation';
import type { Mutation } from './mutation';
import { ctx, mutationId, otherMutationId, patch, recordId, workItem } from './fixtures';

const runs = { numRuns: 500 };
const text = fc.oneof(
	fc.string(),
	fc.constant('库存管理系统开发'),
	fc.constant('第1寺院'),
	fc.constant('修复洗手台'),
);
const json = fc.jsonValue();
const time = fc.integer({ min: 101, max: 900 });
const arbitraryRecord = fc
	.record({
		name: text,
		description: text,
		pin_sort: fc.integer(),
		deleted_at: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
	})
	.map((fields): WorkItem => ({ ...workItem, ...fields }));

function userFields(record: AnyRecord | null): unknown {
	if (record === null) return null;
	const { updated_at: _at, updated_by: _by, rev: _rev, deleted_at, ...fields } = record;
	return { ...fields, deleted: deleted_at !== null };
}

describe('merge properties (500 runs each)', () => {
	it('is record-idempotent for all four mutation kinds, including conflicts and restore', () => {
		fc.assert(
			fc.property(
				arbitraryRecord,
				fc.constantFrom('put', 'patch', 'delete', 'undelete'),
				text,
				text,
				fc.integer({ min: 0, max: 1000 }),
				fc.boolean(),
				fc.boolean(),
				(before, kind, name, description, at, restore, missing) => {
					const current = missing && kind !== 'patch' ? null : before;
					const m: Mutation = {
						id: mutationId,
						entity: 'work_item',
						record_id: recordId,
						kind,
						at,
						device_id: 'device-a',
						...(kind === 'put' ? { value: { ...before, name, description } } : {}),
						...(kind === 'patch'
							? {
									fields: {
										name: { from: '', to: name },
										description: { from: before.description, to: description },
									},
								}
							: {}),
					};
					const applyCtx: ApplyContext = {
						...ctx,
						rev: 2,
						...(restore ? { mode: 'restore' } : {}),
					};
					const once = applyMutation(current, m, applyCtx);
					const twice = applyMutation(once.next, m, applyCtx);
					expect(twice.next).toEqual(once.next);
					expect(twice.next).toBe(once.next);
					expect(twice.changed).toBe(false);
					const firstIds = new Set(once.conflicts.map((conflict) => conflict.id));
					for (const conflict of twice.conflicts) expect(firstIds.has(conflict.id)).toBe(true);
					if (twice.next) expect(schemas.work_item.parse(twice.next)).toEqual(twice.next);
				},
			),
			runs,
		);
	});

	it('is idempotent for arbitrary JSON before-images and after-images', () => {
		fc.assert(
			fc.property(json, json, json, time, (from, to, stored, at) => {
				const current = { ...workItem, name: 'preset', config: stored };
				const {
					description: _desc,
					type_id: _type,
					project_id: _project,
					place_id: _place,
					pinned_at: _pinned,
					pin_sort: _sort,
					archived_at: _archived,
					...preset
				} = current;
				const m = patch({ entity: 'report_preset', fields: { config: { from, to } }, at });
				const first = applyMutation(schemas.report_preset.parse(preset), m, ctx);
				const second = applyMutation(first.next, m, ctx);
				expect(second.next).toBe(first.next);
				expect(second.changed).toBe(false);
				for (const conflict of second.conflicts)
					expect(first.conflicts.map((item) => item.id)).toContain(conflict.id);
			}),
			runs,
		);
	});

	it('converges for different fields in either order without conflicts', () => {
		fc.assert(
			fc.property(
				text,
				text,
				text,
				text,
				fc.oneof(
					fc.tuple(time, time),
					time.map((at) => [at, at]),
				),
				(name, description, newName, newDescription, times) => {
					const before = { ...workItem, name, description };
					const a = patch({
						entity: 'work_item',
						at: times[0]!,
						fields: { name: { from: name, to: newName } },
					});
					const b = patch({
						id: otherMutationId,
						entity: 'work_item',
						device_id: 'device-b',
						at: times[1]!,
						fields: { description: { from: description, to: newDescription } },
					});
					const ab = [applyMutation(before, a, ctx)];
					ab.push(applyMutation(ab[0]!.next, b, ctx));
					const ba = [applyMutation(before, b, ctx)];
					ba.push(applyMutation(ba[0]!.next, a, ctx));
					expect(ab[1]!.next).toEqual(ba[1]!.next);
					for (const result of [...ab, ...ba]) expect(result.conflicts).toEqual([]);
				},
			),
			runs,
		);
	});

	it('converges for the same field and preserves the losing value exactly once per order', () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(text, { minLength: 3, maxLength: 3 }),
				fc.oneof(
					fc.tuple(time, time),
					time.map((at) => [at, at]),
				),
				(values, times) => {
					const before = { ...workItem, name: values[0]! };
					const a = patch({
						entity: 'work_item',
						at: times[0]!,
						fields: { name: { from: values[0], to: values[1] } },
					});
					const b = patch({
						id: otherMutationId,
						entity: 'work_item',
						device_id: 'device-b',
						at: times[1]!,
						fields: { name: { from: values[0], to: values[2] } },
					});
					const ab = applyMutation(applyMutation(before, a, ctx).next, b, ctx);
					const ba = applyMutation(applyMutation(before, b, ctx).next, a, ctx);
					const aWins = times[0]! > times[1]!; // device-b wins equal-time edits.
					expect(ab.next).toEqual(ba.next);
					expect(ab.next).toMatchObject({ name: aWins ? values[1] : values[2] });
					for (const result of [ab, ba]) {
						expect(result.conflicts).toHaveLength(1);
						expect(result.conflicts[0]).toMatchObject({
							field: 'name',
							kept_value: aWins ? values[1] : values[2],
							other_value: aWins ? values[2] : values[1],
							kept_device: aWins ? 'device-a' : 'device-b',
							other_device: aWins ? 'device-b' : 'device-a',
						});
					}
				},
			),
			runs,
		);
	});

	it('round-trips every user field through inverses of all mutation kinds', () => {
		fc.assert(
			fc.property(
				arbitraryRecord,
				text,
				text,
				fc.constantFrom('put', 'patch', 'delete', 'undelete'),
				(before, name, description, kind) => {
					const m: Mutation = {
						id: mutationId,
						entity: 'work_item',
						record_id: recordId,
						kind,
						at: 200,
						device_id: 'device-a',
						...(kind === 'put' ? { value: { ...before, name, description, pinned_at: 200 } } : {}),
						...(kind === 'patch'
							? {
									fields: {
										name: { from: before.name, to: name },
										description: { from: before.description, to: description },
									},
								}
							: {}),
					};
					const applied = applyMutation(before, m, ctx);
					const inverse = invertMutation(m, before, { now: 300, deviceId: 'device-a' });
					let undone = applied.next;
					for (const mutation of inverse) undone = applyMutation(undone, mutation, ctx).next;
					expect(userFields(undone)).toEqual(userFields(before));
				},
			),
			runs,
		);
	});

	it('replays pending edits in queue order exactly as sequential application does, whatever their edit times', () => {
		fc.assert(
			fc.property(
				arbitraryRecord,
				text,
				fc.array(text, { maxLength: 12 }),
				(before, serverName, names) => {
					const server = patch({
						entity: 'work_item',
						at: 150,
						device_id: 'server-device',
						fields: { name: { from: before.name, to: serverName } },
					});
					const pulled = applyMutation(before, server, ctx).next;
					const pending = names.map((name, i) =>
						patch({
							entity: 'work_item',
							id: `00000000-0000-7000-8000-${String(i + 100).padStart(12, '0')}`,
							// Edit times decrease along the queue (a clock that stepped back):
							// replay must still follow queue order, as sequential application does.
							at: 200 + names.length - i,
							fields: { name: { from: i === 0 ? before.name : names[i - 1], to: name } },
						}),
					);
					let expected = pulled;
					const conflicts = [];
					for (const m of pending) {
						const result = applyMutation(expected, m, ctx);
						expected = result.next;
						conflicts.push(...result.conflicts);
					}
					const result = replay(pulled, pending, ctx);
					expect(result.next).toEqual(expected);
					expect(result.conflicts).toEqual(conflicts);
					expect(result.changed).toBe(
						JSON.stringify(userFields(expected)) !== JSON.stringify(userFields(pulled)) ||
							expected!.updated_at !== pulled!.updated_at,
					);
				},
			),
			runs,
		);
	});
});
