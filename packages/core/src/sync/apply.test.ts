import { describe, expect, it } from 'vitest';
import { schemas, sessionFixId } from '../schema';
import { applyMutation, clampAt, conflictId, replay } from './apply';
import { deleteMutation, MutationError, putMutation, undeleteMutation } from './mutation';
import {
	common,
	ctx,
	mutationId,
	otherMutationId,
	patch,
	project,
	recordId,
	session,
	unicode,
} from './fixtures';

describe('per-field merge', () => {
	it('applies a matching before-image, leaving other fields and inputs untouched', () => {
		const before = { ...project };
		const m = patch();
		const result = applyMutation(before, m, { ...ctx, rev: 20 });
		expect(result).toEqual({
			next: { ...before, name: 'renamed', updated_at: 200, updated_by: 'device-a', rev: 20 },
			conflicts: [],
			changed: true,
		});
		expect(before).toEqual(project);
		expect(m).toEqual(patch());
	});

	it('treats an already stored after-image as a no-op without advancing metadata', () => {
		const current = { ...project, name: 'renamed' };
		const result = applyMutation(current, patch(), { ...ctx, rev: 999 });
		expect(result).toEqual({ next: current, conflicts: [], changed: false });
		expect(result.next).toBe(current);
	});

	it('applies different fields independently even when an older patch arrives last', () => {
		const current = { ...project, archived_at: 250, updated_at: 300, updated_by: 'device-b' };
		const result = applyMutation(current, patch(), ctx);
		expect(result).toMatchObject({
			next: { name: 'renamed', archived_at: 250, updated_at: 300, updated_by: 'device-b' },
			conflicts: [],
			changed: true,
		});
	});

	it('converges in every record field when independent edits have equal timestamps', () => {
		const a = patch();
		const b = patch({
			id: otherMutationId,
			device_id: 'device-b',
			fields: { archived_at: { from: null, to: 150 } },
		});
		const ab = applyMutation(applyMutation(project, a, ctx).next, b, ctx);
		const ba = applyMutation(applyMutation(project, b, ctx).next, a, ctx);
		expect(ab.conflicts).toEqual([]);
		expect(ba.conflicts).toEqual([]);
		expect(ab.next).toEqual(ba.next);
	});

	it.each([
		[199, false],
		[200, false],
		[201, true],
	])('resolves a conflict at %s using time and then device id', (at, wins) => {
		const current = { ...project, name: 'device-b edit', updated_at: 200, updated_by: 'device-b' };
		const result = applyMutation(current, patch({ at }), { ...ctx, rev: 10 });
		expect(result.next).toMatchObject({ name: wins ? 'renamed' : 'device-b edit' });
		expect(result.changed).toBe(wins);
		if (!wins) expect(result.next).toBe(current);
		expect(result.conflicts).toEqual([
			{
				id: conflictId(mutationId, 'name'),
				rev: 10,
				created_at: 1000,
				updated_at: 1000,
				updated_by: wins ? 'device-a' : 'device-b',
				deleted_at: null,
				entity: 'project',
				record_id: recordId,
				field: 'name',
				kept_value: wins ? 'renamed' : 'device-b edit',
				other_value: wins ? 'device-b edit' : 'renamed',
				kept_device: wins ? 'device-a' : 'device-b',
				other_device: wins ? 'device-b' : 'device-a',
				at: 1000,
				resolved_at: null,
			},
		]);
		expect(schemas.conflict.parse(result.conflicts[0])).toEqual(result.conflicts[0]);
	});

	it('re-emits the same losing conflict id and record on retry', () => {
		const current = { ...project, name: 'newer', updated_at: 300, updated_by: 'device-b' };
		const first = applyMutation(current, patch(), ctx);
		const second = applyMutation(first.next, patch(), ctx);
		expect(second).toEqual(first);
		expect(second.next).toBe(current);
		expect(second.changed).toBe(false);
	});

	it('can accept one field and retain a conflict for another in the same patch', () => {
		const current = { ...project, name: 'newer', updated_at: 300, updated_by: 'device-b' };
		const m = patch({ fields: { ...patch().fields, archived_at: { from: null, to: 150 } } });
		const first = applyMutation(current, m, ctx);
		expect(first.next).toMatchObject({
			name: 'newer',
			archived_at: 150,
			updated_at: 300,
			updated_by: 'device-b',
		});
		expect(first.conflicts).toHaveLength(1);
		const second = applyMutation(first.next, m, ctx);
		expect(second.changed).toBe(false);
		expect(second.conflicts).toEqual(first.conflicts);
	});

	it('compares nested JSON structurally without depending on key insertion order', () => {
		const current = { ...common, name: unicode, config: { a: [1, 2], b: { text: unicode } } };
		const m = patch({
			entity: 'report_preset',
			fields: {
				config: {
					from: { b: { text: unicode }, a: [1, 2] },
					to: { a: [2, 1], b: { text: unicode } },
				},
			},
		});
		const result = applyMutation(current, m, ctx);
		expect(result.next).toMatchObject({ config: { a: [2, 1], b: { text: unicode } } });
		expect(result.conflicts).toEqual([]);
		expect(applyMutation(result.next, m, ctx).changed).toBe(false);
	});

	it.each(['id', 'rev', 'created_at', 'deleted_at', 'missing', '__proto__', 'constructor'])(
		'throws MutationError for forbidden field %s',
		(field) => {
			const fields = Object.fromEntries([[field, { from: null, to: null }]]);
			expect(() => applyMutation(project, patch({ fields }), ctx)).toThrow(MutationError);
		},
	);

	it('rejects invalid records, ids, field values and missing targets', () => {
		expect(() =>
			applyMutation(project, patch({ fields: { name: { from: unicode, to: null } } }), ctx),
		).toThrow(MutationError);
		expect(() => applyMutation({ ...project, name: 1 } as never, patch(), ctx)).toThrow(
			MutationError,
		);
		expect(() => applyMutation(project, patch({ record_id: otherMutationId }), ctx)).toThrow(
			MutationError,
		);
		expect(() => applyMutation(null, patch(), ctx)).toThrow(MutationError);
		expect(() => applyMutation(project, patch(), { ...ctx, rev: -1 })).toThrow(MutationError);
	});

	it('validates the final record including refinements spanning several fields', () => {
		const fix = {
			...common,
			id: sessionFixId(recordId, 'start'),
			session_id: recordId,
			kind: 'start' as const,
			lat: 0,
			lng: 0,
			accuracy_m: 0,
			captured_at: 100,
		};
		expect(() =>
			applyMutation(
				fix,
				patch({
					entity: 'session_fix',
					record_id: fix.id,
					fields: { kind: { from: 'start', to: 'end' } },
				}),
				ctx,
			),
		).toThrow(MutationError);
	});
});

describe('tombstones', () => {
	const deletion = deleteMutation('project', recordId, { now: 200, deviceId: 'device-a' });
	const restoration = undeleteMutation('project', recordId, { now: 300, deviceId: 'device-a' });

	it('deletes and undeletes without losing data and leaves repeated operations unchanged', () => {
		const deleted = applyMutation(project, deletion, { ...ctx, rev: 5 });
		expect(deleted.next).toMatchObject({
			name: unicode,
			deleted_at: 200,
			updated_at: 200,
			updated_by: 'device-a',
			rev: 5,
		});
		expect(applyMutation(deleted.next, deletion, { ...ctx, rev: 6 })).toEqual({
			next: deleted.next,
			conflicts: [],
			changed: false,
		});
		const restored = applyMutation(deleted.next, restoration, ctx);
		expect(restored.next).toMatchObject({ name: unicode, deleted_at: null, updated_at: 300 });
		expect(applyMutation(restored.next, restoration, ctx)).toEqual({
			next: restored.next,
			conflicts: [],
			changed: false,
		});
	});

	it('deleting or undeleting a missing record is a no-op', () => {
		for (const m of [deletion, restoration])
			expect(applyMutation(null, m, ctx)).toEqual({ next: null, conflicts: [], changed: false });
	});

	it('a patch restores a tombstone, including an older or otherwise unchanged patch', () => {
		const current = { ...project, deleted_at: 400, updated_at: 400, updated_by: 'device-b' };
		for (const m of [patch(), patch({ fields: { name: { from: unicode, to: unicode } } })]) {
			const result = applyMutation(current, m, ctx);
			expect(result.next).toMatchObject({
				deleted_at: null,
				updated_at: 400,
				updated_by: 'device-b',
			});
			expect(result.changed).toBe(true);
			expect(result.conflicts).toHaveLength(1);
			expect(result.conflicts[0]).toMatchObject({
				field: 'deleted_at',
				kept_value: null,
				other_value: 400,
				kept_device: 'device-a',
				other_device: 'device-b',
			});
			expect(applyMutation(result.next, m, ctx).changed).toBe(false);
		}
	});

	it('rejects an explicit deleted_at patch before it can break restoration idempotence', () => {
		const current = { ...project, deleted_at: 50 };
		const m = patch({ fields: { deleted_at: { from: 50, to: 150 } } });
		for (let attempt = 0; attempt < 2; attempt++) {
			expect(() => applyMutation(current, m, ctx)).toThrow(MutationError);
			expect(current).toEqual({ ...project, deleted_at: 50 });
		}
	});
});

describe('puts and restore', () => {
	it('creates a record, stamps its write metadata and makes the second put a no-op', () => {
		const m = putMutation('project', project, { now: 200, deviceId: 'device-a' });
		const first = applyMutation(null, m, { ...ctx, rev: 5 });
		expect(first).toEqual({
			next: { ...project, rev: 5, updated_at: 200, updated_by: 'device-a' },
			conflicts: [],
			changed: true,
		});
		expect(applyMutation(first.next, m, { ...ctx, rev: 6 })).toEqual({
			next: first.next,
			conflicts: [],
			changed: false,
		});
	});

	it.each([50, 100, 200])('merges a put at %s by time, without a before-image', (at) => {
		const value = { ...project, name: 'put name', archived_at: 10, rev: 99, created_at: 99 };
		const m = putMutation('project', value, { now: at, deviceId: 'device-a' });
		const result = applyMutation(project, m, ctx);
		expect(result.next).toMatchObject({
			name: at > 100 ? 'put name' : unicode,
			archived_at: at > 100 ? 10 : null,
			created_at: 0,
			rev: 1,
		});
		expect(result.conflicts.map((c) => c.field).sort()).toEqual(['archived_at', 'name']);
		expect(result.changed).toBe(at > 100);
		expect(applyMutation(result.next, m, ctx).changed).toBe(false);
	});

	it('restore overwrites user fields and created_at, retains monotonic write time, and emits no conflicts', () => {
		const current = { ...project, name: 'newer', updated_at: 500, updated_by: 'device-b' };
		const value = { ...project, created_at: 10, archived_at: 20 };
		const m = putMutation('project', value, { now: 200, deviceId: 'device-a' });
		const restoreCtx = { ...ctx, rev: 10, mode: 'restore' as const };
		const result = applyMutation(current, m, restoreCtx);
		expect(result).toEqual({
			next: { ...value, updated_at: 500, updated_by: 'device-b', rev: 10 },
			conflicts: [],
			changed: true,
		});
		expect(applyMutation(result.next, m, { ...restoreCtx, rev: 11 })).toEqual({
			next: result.next,
			conflicts: [],
			changed: false,
		});
	});

	it('rejects puts that change deletion state, including restore and losing puts', () => {
		for (const current of [project, { ...project, deleted_at: 50 }]) {
			const value = { ...project, deleted_at: current.deleted_at === null ? 150 : null };
			const m = putMutation('project', value, { now: 0, deviceId: 'device-a' });
			expect(() => applyMutation(current, m, ctx)).toThrow(MutationError);
			expect(() => applyMutation(current, m, { ...ctx, mode: 'restore' })).toThrow(MutationError);
		}
	});

	it('rejects a put with a missing required field rather than inserting partial data', () => {
		const { name: _name, ...value } = project;
		expect(() =>
			applyMutation(
				null,
				{
					id: mutationId,
					entity: 'project',
					record_id: recordId,
					kind: 'put',
					value,
					at: 200,
					device_id: 'device-a',
				},
				ctx,
			),
		).toThrow(MutationError);
	});
});

describe('clock clamping', () => {
	it('only caps the future at five minutes and never raises past edits', () => {
		expect(clampAt(-100, 1000)).toBe(-100);
		expect(clampAt(301000, 1000)).toBe(301000);
		expect(clampAt(900000, 1000)).toBe(301000);
		const result = applyMutation(project, patch({ at: 900000 }), ctx);
		expect(result.next!.updated_at).toBe(301000);
		const deletion = { ...patch({ at: 900000 }), kind: 'delete' as const, fields: undefined };
		expect(applyMutation(project, deletion, ctx).next!.deleted_at).toBe(301000);
	});

	it('uses the clamped clock when selecting the conflict winner', () => {
		const current = { ...project, name: 'newer', updated_at: 400000, updated_by: 'device-b' };
		const result = applyMutation(current, patch({ at: 900000 }), ctx);
		expect(result.changed).toBe(false);
		expect(result.conflicts[0]).toMatchObject({ kept_value: 'newer', other_value: 'renamed' });
	});

	it.each([NaN, Infinity, 0.5])('rejects invalid edit or applier time %s', (at) => {
		expect(() => clampAt(at, 1000)).toThrow(MutationError);
		expect(() => clampAt(1000, at)).toThrow(MutationError);
	});
});

describe('SPEC cross-device cases and rebase', () => {
	it('keeps the later stop and both devices in an end_at conflict, in either order', () => {
		const early = patch({ entity: 'session', fields: { end_at: { from: null, to: 150 } } });
		const late = patch({
			id: otherMutationId,
			entity: 'session',
			at: 300,
			device_id: 'device-b',
			fields: { end_at: { from: null, to: 250 } },
		});
		for (const mutations of [
			[early, late],
			[late, early],
		]) {
			const result = applyMutation(
				applyMutation(session, mutations[0]!, ctx).next,
				mutations[1]!,
				ctx,
			);
			expect(result.next).toMatchObject({ end_at: 250, updated_at: 300, updated_by: 'device-b' });
			expect(result.conflicts).toHaveLength(1);
			expect(result.conflicts[0]).toMatchObject({
				field: 'end_at',
				kept_value: 250,
				other_value: 150,
				kept_device: 'device-b',
				other_device: 'device-a',
			});
		}
	});

	it('keeps two sessions started independently offline under their distinct ids', () => {
		const records = [session, { ...session, id: otherMutationId, origin_device_id: 'device-b' }];
		const results = records.map((record, i) =>
			applyMutation(
				null,
				putMutation('session', record, { now: 200, deviceId: `device-${i}` }),
				ctx,
			),
		);
		expect(new Set(results.map((r) => r.next!.id)).size).toBe(2);
		for (const result of results) {
			expect(result.next).toMatchObject({ end_at: null });
			expect(result.conflicts).toEqual([]);
		}
	});

	it('replays in outbox order over pulled state, even when the clock stepped back', () => {
		const first = patch({ at: 300, fields: { name: { from: 'original', to: 'renamed' } } });
		// Queued after `first`, but stamped earlier because the device clock stepped back.
		const second = patch({
			id: otherMutationId,
			at: 250,
			fields: { name: { from: 'renamed', to: 'last edit' } },
		});
		const pending = [first, second];
		const pulled = {
			...project,
			name: 'original',
			updated_at: 150,
			updated_by: 'server-device',
		};
		const result = replay(pulled, pending, ctx);
		expect(result.next).toMatchObject({ name: 'last edit' });
		expect(result.conflicts).toEqual([]);
		expect(result.changed).toBe(true);
		expect(pending).toEqual([first, second]);
		expect(replay(pulled, [], ctx)).toEqual({ next: pulled, conflicts: [], changed: false });
		expect(replay(null, [], ctx)).toEqual({ next: null, conflicts: [], changed: false });
		expect(() => replay(project, [first, { ...second, record_id: otherMutationId }], ctx)).toThrow(
			MutationError,
		);
	});
});
