import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Session, WorkItem } from '../schema';
import { applyMutation } from './apply';
import type { AnyRecord, ApplyContext, ApplyResult } from './apply';
import { deleteMutation, mutationSchema, putMutation, undeleteMutation } from './mutation';
import type { Mutation } from './mutation';
import {
	ctx,
	otherMutationId,
	patch,
	project,
	recordId,
	session,
	unicode,
	workItem,
} from './fixtures';

// The validated path must give exactly the normal path's result for any input
// that the batch schema accepts. These tests compare the two directly.

type Outcome = { ok: true; result: ApplyResult } | { ok: false; error: string };

function outcome(current: AnyRecord | null, m: Mutation, applyCtx: ApplyContext): Outcome {
	try {
		return { ok: true, result: applyMutation(current, m, applyCtx) };
	} catch (error) {
		if (error instanceof Error && error.name === 'MutationError') {
			return { ok: false, error: error.message };
		}
		throw error;
	}
}

function expectSame(current: AnyRecord | null, m: Mutation, applyCtx: ApplyContext) {
	const normal = outcome(current, m, applyCtx);
	const validated = outcome(current, m, { ...applyCtx, validated: true });
	expect(validated).toEqual(normal);
	return normal;
}

describe('validated apply path', () => {
	it('matches the normal path on every core fixture mutation and starting state', () => {
		// Storage keys records by entity, so a mutation only ever meets its own entity's state.
		const cases: { states: (AnyRecord | null)[]; mutations: Mutation[] }[] = [
			{
				states: [null, project, { ...project, rev: 3, updated_at: 300, updated_by: 'device-b' }],
				mutations: [
					patch(),
					patch({ at: 50 }),
					patch({ at: 100, device_id: 'device-z' }),
					patch({ at: 9_999_999 }),
					putMutation(
						'project',
						{ ...project, name: '洗手台' },
						{ now: ctx.now, deviceId: 'device-a' },
					),
					deleteMutation('project', recordId, { now: ctx.now, deviceId: 'device-a' }),
					undeleteMutation('project', recordId, { now: ctx.now, deviceId: 'device-a' }),
				],
			},
			{
				states: [null, workItem, { ...workItem, deleted_at: 50 }],
				mutations: [
					{ ...patch(), entity: 'work_item', fields: { name: { from: unicode, to: '第1寺院' } } },
					putMutation(
						'work_item',
						{ ...workItem, description: 'put' },
						{ now: ctx.now, deviceId: 'device-a' },
					),
					deleteMutation('work_item', recordId, { now: ctx.now, deviceId: 'device-a' }),
					undeleteMutation('work_item', recordId, { now: ctx.now, deviceId: 'device-a' }),
				],
			},
			{
				states: [null, session as AnyRecord, { ...session, deleted_at: 50 } as AnyRecord],
				mutations: [
					putMutation('session', { ...session, note: 'put' } as Session, {
						now: ctx.now,
						deviceId: 'device-a',
					}),
					deleteMutation('session', recordId, { now: ctx.now, deviceId: 'device-a' }),
				],
			},
		];
		const applyContexts: ApplyContext[] = [
			ctx,
			{ ...ctx, rev: 7 },
			{ ...ctx, rev: 7, mode: 'restore' },
		];
		for (const { states, mutations } of cases) {
			for (const current of states) {
				for (const raw of mutations) {
					const m = mutationSchema.parse(raw) as Mutation;
					for (const applyCtx of applyContexts) {
						expectSame(current, m, applyCtx);
					}
				}
			}
		}
	});

	it('still rejects a current record whose id does not match the mutation', () => {
		const m = mutationSchema.parse(patch()) as Mutation;
		const other = { ...project, id: otherMutationId };
		expect(outcome(other, m, { ...ctx, validated: true })).toEqual({
			ok: false,
			error: 'Current record id mismatch',
		});
	});

	it('matches the normal path on random mutation sequences', () => {
		const text = fc.oneof(
			fc.string(),
			fc.constant('库存管理系统开发'),
			fc.constant('第1寺院'),
			fc.constant('修复洗手台'),
		);
		const field = fc.constantFrom('name', 'description', 'pin_sort');
		const change = fc
			.tuple(field, text, fc.integer({ min: -5, max: 5 }), fc.boolean())
			.map(([name, t, n, numeric]) => ({
				name,
				from: name === 'pin_sort' ? n : t,
				to: name === 'pin_sort' ? n + 1 : numeric ? t : t + '!',
			}));
		const workRecord = fc
			.record({
				name: text,
				description: text,
				pin_sort: fc.integer({ min: -5, max: 5 }),
				deleted_at: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
			})
			.map((fields): WorkItem => ({ ...workItem, ...fields }));
		const rawMutation = fc
			.record({
				kind: fc.constantFrom('put', 'patch', 'delete', 'undelete'),
				at: fc.integer({ min: 0, max: 900 }),
				device: fc.constantFrom('device-a', 'device-b'),
				changes: fc.uniqueArray(change, { selector: (c) => c.name, maxLength: 3 }),
				record: workRecord,
				id: fc.integer({ min: 0, max: 10 }),
			})
			.map(({ kind, at, device, changes, record, id }): Mutation => {
				const base = {
					id: `00000000-0000-7000-8000-${String(id).padStart(12, '0')}`,
					entity: 'work_item' as const,
					record_id: recordId,
					at,
					device_id: device,
				};
				if (kind === 'put') return { ...base, kind, value: { ...record } };
				if (kind === 'patch') {
					const fields = Object.fromEntries(
						changes.map((c) => [c.name, { from: c.from, to: c.to }]),
					);
					return { ...base, kind, fields };
				}
				return { ...base, kind };
			});

		fc.assert(
			fc.property(
				fc.option(workRecord, { nil: null }),
				fc.array(rawMutation, { minLength: 1, maxLength: 8 }),
				fc.boolean(),
				(start, raws, restore) => {
					let current: AnyRecord | null = start;
					const applyCtx: ApplyContext = {
						...ctx,
						rev: 4,
						...(restore ? { mode: 'restore' } : {}),
					};
					for (const raw of raws) {
						const parsed = mutationSchema.safeParse(raw);
						// Only what batchSchema would accept can reach the validated path.
						if (!parsed.success) continue;
						const m = parsed.data as Mutation;
						const normal = expectSame(current, m, applyCtx);
						if (normal.ok) current = normal.result.next;
					}
				},
			),
			{ numRuns: 500 },
		);
	});
});
