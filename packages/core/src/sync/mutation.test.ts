import { describe, expect, it } from 'vitest';
import { idTimestamp, isUuid } from '../ids';
import { uuidSchema } from '../schema';
import {
	MAX_BATCH,
	MutationError,
	batchSchema,
	deleteMutation,
	invertMutation,
	makeBatches,
	mutationSchema,
	patchMutation,
	putMutation,
	undeleteMutation,
} from './mutation';
import { applyMutation, conflictId } from './apply';
import type { AnyRecord } from './apply';
import { ctx, mutationId, patch, project, recordId, unicode } from './fixtures';

const write = { now: 200, deviceId: 'device-a' };

function userFields(record: AnyRecord) {
	const { rev: _rev, updated_at: _at, updated_by: _by, deleted_at, ...fields } = record;
	return { ...fields, deleted: deleted_at !== null };
}

describe('mutation builders and validation', () => {
	it('builds validated mutations with a fresh UUIDv7, client clock and device', () => {
		const mutations = [
			putMutation('project', project, write),
			patchMutation('project', project, { name: '第1寺院' }, write)!,
			deleteMutation('project', recordId, write),
			undeleteMutation('project', recordId, write),
		];
		expect(new Set(mutations.map((m) => m.id)).size).toBe(4);
		for (const m of mutations) {
			expect(idTimestamp(m.id)).not.toBeNull();
			expect(m).toMatchObject({
				entity: 'project',
				record_id: recordId,
				at: 200,
				device_id: 'device-a',
			});
			expect(mutationSchema.parse(m)).toEqual(m);
		}
		expect(mutations[1]!.fields).toEqual({ name: { from: unicode, to: '第1寺院' } });
	});

	it('compares JSON deeply and returns null for an empty or unchanged patch', () => {
		expect(patchMutation('project', project, {}, write)).toBeNull();
		expect(patchMutation('project', project, { name: unicode }, write)).toBeNull();
		const preset = { ...project, config: { a: [1, { text: unicode }], b: true } };
		const { archived_at: _archived, ...record } = preset;
		expect(
			patchMutation(
				'report_preset',
				record,
				{ config: { b: true, a: [1, { text: unicode }] } },
				write,
			),
		).toBeNull();
	});

	it.each(['id', 'rev', 'created_at', 'deleted_at', 'unknown', '__proto__', 'constructor'])(
		'rejects forbidden patch field %s even when unchanged',
		(field) => {
			const changes = Object.fromEntries([[field, (project as Record<string, unknown>)[field]]]);
			expect(() => patchMutation('project', project, changes, write)).toThrow(MutationError);
		},
	);

	it.each([
		{ kind: 'patch', fields: undefined },
		{ kind: 'put' },
		{ kind: 'put', value: { ...project, id: mutationId } },
		{ kind: 'put', value: { ...project, extra: 'lost' } },
		{ kind: 'delete', fields: {} },
		{ kind: 'undelete', value: project },
		{ at: Infinity },
		{ at: 1.5 },
		{ id: '00000000-0000-8000-8000-000000000030' },
		{ fields: { name: { to: 'missing before-image' } } },
		{ fields: { name: { from: unicode, to: undefined } } },
		{ fields: { name: { from: unicode, to: 1 } } },
		{ fields: { name: { from: unicode, to: () => 'not JSON' } } },
	])('rejects malformed mutation %j', (overrides) => {
		expect(mutationSchema.safeParse({ ...patch(), ...overrides }).success).toBe(false);
	});

	it('builders take snapshots rather than retaining mutable JSON references', () => {
		const original = { ...project };
		const m = putMutation('project', original, write);
		original.name = 'changed after queueing';
		expect(m.value!.name).toBe(unicode);
	});

	it('splits batches at 50, preserving every mutation, order and restore mode', () => {
		let sequence = 0;
		const ids = () => `00000000-0000-7000-8000-${String(++sequence).padStart(12, '0')}`;
		const mutations = Array.from({ length: 123 }, () => deleteMutation('project', recordId, write));
		const batches = makeBatches('device-a', mutations, 'restore', ids);
		expect(MAX_BATCH).toBe(50);
		expect(batches.map((b) => b.mutations.length)).toEqual([50, 50, 23]);
		expect(batches.flatMap((b) => b.mutations)).toEqual(mutations);
		expect(new Set(batches.map((b) => b.batch_id)).size).toBe(3);
		for (const batch of batches) {
			expect(batch.mode).toBe('restore');
			expect(batchSchema.parse(batch)).toEqual(batch);
		}
		expect(makeBatches('device-a', [])).toEqual([]);
		expect(makeBatches('device-a', mutations.slice(0, 50))[0]).not.toHaveProperty('mode');
		expect(makeBatches('device-a', mutations.slice(0, 51)).map((b) => b.mutations.length)).toEqual([
			50, 1,
		]);
		expect(
			batchSchema.safeParse({ ...batches[0], mutations: mutations.slice(0, 51) }).success,
		).toBe(false);
		expect(() => makeBatches('wrong-device', mutations)).toThrow(MutationError);
		expect(() => makeBatches('device-a', mutations, undefined, () => 'bad-id')).toThrow(
			MutationError,
		);
	});
});

describe('deterministic conflict ids', () => {
	it('uses UUIDv8 version and RFC variant bits and validates as a record id', () => {
		const id = conflictId(mutationId, 'name');
		expect(isUuid(id)).toBe(true);
		expect(uuidSchema.parse(id)).toBe(id);
		expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		expect(conflictId(mutationId, 'name')).toBe(id);
		expect(conflictId(mutationId, 'note')).not.toBe(id);
		expect(conflictId(recordId, 'name')).not.toBe(id);
		expect(conflictId(mutationId, unicode)).toBe(conflictId(mutationId, unicode));
	});
});

describe('undo inverses', () => {
	it('undoes creation with a tombstone, preserving the created data', () => {
		const m = putMutation('project', project, write);
		const created = applyMutation(null, m, ctx).next;
		const inverse = invertMutation(m, null, { ...write, now: 300 });
		expect(inverse.map((m) => m.kind)).toEqual(['delete']);
		expect(applyMutation(created, inverse[0]!, ctx).next).toMatchObject({
			name: unicode,
			deleted_at: 300,
		});
	});

	it('restores every user field and deletion state after undoing a patch or undelete', () => {
		const before = { ...project, deleted_at: 50 };
		for (const m of [patch(), undeleteMutation('project', recordId, write)]) {
			const next = applyMutation(before, m, ctx).next;
			const inverse = invertMutation(m, before, { ...write, now: 300 });
			expect(inverse.map((m) => m.kind)).toEqual(
				m.kind === 'patch' ? ['patch', 'delete'] : ['delete'],
			);
			let undone = next;
			for (const mutation of inverse) undone = applyMutation(undone, mutation, ctx).next;
			expect(undone!.deleted_at).not.toBeNull();
			expect(userFields(undone!)).toEqual(userFields(before));
		}
	});

	it('undoes no-op deletes and undeletes without changing tombstone state', () => {
		for (const before of [project, { ...project, deleted_at: 50 }]) {
			for (const m of [
				deleteMutation('project', recordId, write),
				undeleteMutation('project', recordId, write),
			]) {
				const next = applyMutation(before, m, ctx).next;
				const inverse = invertMutation(m, before, { ...write, now: 300 });
				let undone = next;
				for (const mutation of inverse) undone = applyMutation(undone, mutation, ctx).next;
				expect(undone!.deleted_at !== null).toBe(before.deleted_at !== null);
				expect(userFields(undone!)).toEqual(userFields(before));
			}
		}
	});

	it('returns one inverse for a plain patch, put or delete', () => {
		for (const m of [
			patch(),
			putMutation('project', { ...project, name: 'changed' }, write),
			deleteMutation('project', recordId, write),
		]) {
			const next = applyMutation(project, m, ctx).next;
			const inverse = invertMutation(m, project, { ...write, now: 300 });
			expect(inverse).toHaveLength(1);
			expect(userFields(applyMutation(next, inverse[0]!, ctx).next!)).toEqual(userFields(project));
		}
	});

	it('undoes a put to a tombstone without undeleting it', () => {
		const before = { ...project, deleted_at: 50 };
		const m = putMutation('project', { ...before, name: 'changed' }, write);
		const next = applyMutation(before, m, ctx).next;
		const inverse = invertMutation(m, before, { ...write, now: 300 });
		expect(inverse.map((m) => m.kind)).toEqual(['put']);
		const undone = applyMutation(next, inverse[0]!, ctx).next!;
		expect(userFields(undone)).toEqual(userFields(before));
		expect(undone.deleted_at).toBe(50);
	});
});
