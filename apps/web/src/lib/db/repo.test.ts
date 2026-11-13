import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	applyMutation,
	DEFAULT_ACTIVITY_TYPES,
	ENTITIES,
	newId,
	PERSONAL_TYPE_ID,
	planSplit,
	WORK_TYPE_ID,
} from '@hourtrail/core';
import type { AnyRecord } from '@hourtrail/core';
import { createRepo } from './repo';
import type { UndoToken } from './repo';
import { openDb } from './schema';
import type { HourtrailDB } from './schema';
// Reuse the existing core test dependency; this task may not change manifests.
import fc from 'fast-check';

const databases: HourtrailDB[] = [];
function fixture() {
	const db = openDb(`repo-${newId()}`);
	databases.push(db);
	let now = 1000;
	let zone = 'America/Halifax';
	const repo = createRepo(
		db,
		() => now,
		() => zone,
	);
	return {
		db,
		repo,
		at: (value: number) => {
			now = value;
		},
		zone: (value: string) => {
			zone = value;
		},
	};
}
afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(databases.splice(0).map((db) => db.delete()));
});
const itemFields = (name: string) => ({
	name,
	description: '',
	type_id: WORK_TYPE_ID,
	project_id: null,
	place_id: null,
	pinned_at: null,
	pin_sort: 0,
	archived_at: null,
});

async function assertReplay(db: HourtrailDB) {
	const records = new Map<string, AnyRecord>();
	for (const row of await db.outbox.toArray()) {
		const m = row.mutation;
		const key = `${m.entity}:${m.record_id}`;
		const result = applyMutation(records.get(key) ?? null, m, { now: row.queued_at });
		if (result.next) records.set(key, result.next);
	}
	for (const entity of ENTITIES) {
		const expected = [...records]
			.filter(([key]) => key.startsWith(`${entity}:`))
			.map(([, record]) => record)
			.sort((a, b) => a.id.localeCompare(b.id));
		const actual = (await db.entity(entity).toArray()).sort((a, b) => a.id.localeCompare(b.id));
		expect(actual).toEqual(expected);
	}
}

describe('repository transactions', () => {
	it('starts once, persists every session field and ignores a second tap', async () => {
		const { db, repo, at } = fixture();
		const first = await repo.start();
		expect(first.alreadyRunning).toBe(false);
		expect(first.session).toMatchObject({
			rev: 0,
			created_at: 1000,
			updated_at: 1000,
			updated_by: await repo.deviceId(),
			deleted_at: null,
			start_at: 1000,
			start_tz: 'America/Halifax',
			end_at: null,
			end_tz: null,
			work_item_id: null,
			type_id: WORK_TYPE_ID,
			note: '',
			source: 'live',
			place_id: null,
			place_state: 'none',
			place_candidates: [],
			flags: {},
			origin_device_id: await repo.deviceId(),
		});
		at(2000);
		expect(await repo.start()).toEqual({
			session: first.session,
			alreadyRunning: true,
			undo: { label: 'Start', mutations: [], before: [] },
		});
		expect(await db.session.count()).toBe(1);
		const queue = await db.outbox.toArray();
		expect(queue).toHaveLength(1);
		expect(queue[0]).toMatchObject({ seq: 1, batch_id: null, queued_at: 1000 });
		await assertReplay(db);
	});

	it('serializes twenty concurrent starts across repository/database connections', async () => {
		const { db, repo } = fixture();
		const other = openDb(db.name);
		databases.push(other);
		const second = createRepo(
			other,
			() => 1000,
			() => 'UTC',
		);
		const results = await Promise.all(
			Array.from({ length: 20 }, (_, i) => (i % 2 ? repo : second).start()),
		);
		expect(results.filter((r) => !r.alreadyRunning)).toHaveLength(1);
		expect(new Set(results.map((r) => r.session.id)).size).toBe(1);
		expect(await db.session.count()).toBe(1);
		expect(await db.outbox.count()).toBe(1);
	});

	it('stops with the current zone, queues a patch and undoes the stop', async () => {
		const { db, repo, at, zone } = fixture();
		await repo.start();
		const initialCount = await db.outbox.count();
		at(2000);
		zone('Asia/Tokyo');
		const stopped = (await repo.stop())!;
		expect(stopped.session).toMatchObject({ end_at: 2000, end_tz: 'Asia/Tokyo' });
		expect(await repo.running()).toEqual([]);
		expect((await db.outbox.toArray()).at(-1)?.mutation).toMatchObject({
			kind: 'patch',
			fields: { end_at: { from: null, to: 2000 }, end_tz: { from: null, to: 'Asia/Tokyo' } },
		});
		at(3000);
		await repo.undo(stopped.undo);
		expect(await repo.running()).toHaveLength(1);
		expect((await repo.running())[0]).toMatchObject({ end_at: null, end_tz: null });
		expect((await db.outbox.count()) - initialCount).toBe(2);
		await assertReplay(db);
	});

	it('returns oldest running first, ignores tombstones, and stops the newest', async () => {
		const { db, repo, at } = fixture();
		const first = (await repo.start()).session;
		at(2000);
		const second = await repo.create('session', { ...first, id: newId(), start_at: 2000 });
		at(3000);
		const third = await repo.create('session', { ...first, id: newId(), start_at: 3000 });
		await repo.remove('session', third.id);
		expect((await repo.running()).map((s) => s.id)).toEqual([first.id, second.id]);
		expect((await repo.stop())?.session.id).toBe(second.id);
		await assertReplay(db);
	});

	it('switches at one timestamp and undoes both mutations in reverse order', async () => {
		const { db, repo, at } = fixture();
		const first = (await repo.start()).session;
		at(2000);
		const switched = await repo.switchTo({ workItemId: null });
		expect(switched.stopped?.end_at).toBe(switched.started.start_at);
		expect(switched.started.start_at).toBe(2000);
		expect(switched.undo.mutations.map((m) => m.kind)).toEqual(['patch', 'put']);
		at(3000);
		await repo.undo(switched.undo);
		expect((await repo.running()).map((s) => s.id)).toEqual([first.id]);
		expect((await db.session.get(switched.started.id))?.deleted_at).toBe(3000);
		expect((await db.outbox.toArray()).slice(-2).map((r) => r.mutation.kind)).toEqual([
			'delete',
			'patch',
		]);
		await assertReplay(db);
	});

	it('rolls back the stopped session and first outbox row when switch creation fails', async () => {
		const { db, repo, at } = fixture();
		const before = (await repo.start()).session;
		const queue = await db.outbox.toArray();
		at(2000);
		const add = db.outbox.add.bind(db.outbox);
		vi.spyOn(db.outbox, 'add').mockImplementation((...args) => {
			if (args[0].mutation.kind === 'put') throw new Error('Second half failed');
			return add(...args);
		});
		await expect(repo.switchTo({ workItemId: null })).rejects.toThrow('Second half failed');
		expect(await db.session.toArray()).toEqual([before]);
		expect(await db.outbox.toArray()).toEqual(queue);
	});

	it('rolls back a first write, including the lazy device id, on an outbox failure', async () => {
		const { db, repo } = fixture();
		vi.spyOn(db.outbox, 'add').mockImplementation(() => {
			throw new Error('Disk full');
		});
		await expect(repo.start()).rejects.toThrow('Disk full');
		expect(await db.session.count()).toBe(0);
		expect(await db.outbox.count()).toBe(0);
		expect(await db.local.count()).toBe(0);
	});

	it.each(['库存管理系统开发', '第1寺院', '修复洗手台'])(
		'reuses exact Unicode name %s and undoes named creation',
		async (name) => {
			const { db, repo, at } = fixture();
			const first = await repo.startNamed(name);
			expect(first.workItem.name).toBe(name);
			expect(first.session.work_item_id).toBe(first.workItem.id);
			expect(first.workItem).toMatchObject(itemFields(name));
			await repo.stop();
			at(2000);
			const second = await repo.startNamed(name);
			expect(second.workItem.id).toBe(first.workItem.id);
			expect(await db.work_item.count()).toBe(1);
			await repo.undo(second.undo);
			await repo.undo(first.undo);
			expect((await db.work_item.get(first.workItem.id))?.deleted_at).toBe(2000);
			await assertReplay(db);
		},
	);

	it('matches names case-sensitively and excludes archived or deleted items', async () => {
		const { db, repo } = fixture();
		const upper = await repo.create('work_item', itemFields('Task'));
		const lower = await repo.startNamed('task');
		expect(lower.workItem.id).not.toBe(upper.id);
		await repo.stop();
		await repo.update('work_item', lower.workItem.id, { archived_at: 1000 });
		const next = await repo.startNamed('task');
		expect(next.workItem.id).not.toBe(lower.workItem.id);
		await repo.stop();
		await repo.remove('work_item', next.workItem.id);
		expect((await repo.startNamed('task')).workItem.id).not.toBe(next.workItem.id);
		await assertReplay(db);
	});

	it('copies type by id and leaves previous sessions independent', async () => {
		const { repo } = fixture();
		const item = await repo.create('work_item', {
			...itemFields('Work'),
			type_id: PERSONAL_TYPE_ID,
		});
		const started = await repo.start({ workItemId: item.id });
		expect(started.session.type_id).toBe(PERSONAL_TYPE_ID);
		await repo.update('work_item', item.id, { type_id: WORK_TYPE_ID });
		expect((await repo.running())[0]?.type_id).toBe(PERSONAL_TYPE_ID);
		await repo.stop();
		expect((await repo.start({ workItemId: newId() })).session.type_id).toBe(WORK_TYPE_ID);
	});

	it('seeds identical fixed records on two devices only when missing', async () => {
		const a = fixture();
		const b = fixture();
		b.at(5000);
		await a.repo.ensureSeeded();
		await a.repo.ensureSeeded();
		await b.repo.ensureSeeded();
		const stripDevice = (records: AnyRecord[]) => records.map(({ updated_by: _by, ...r }) => r);
		expect(stripDevice(await a.db.activity_type.toArray())).toEqual(
			stripDevice(DEFAULT_ACTIVITY_TYPES),
		);
		expect(stripDevice(await b.db.activity_type.toArray())).toEqual(
			stripDevice(DEFAULT_ACTIVITY_TYPES),
		);
		expect(await a.repo.deviceId()).not.toBe(await b.repo.deviceId());
		expect(await a.db.outbox.count()).toBe(4);
		expect((await a.db.outbox.toArray()).map((row) => row.queued_at)).toEqual([
			1000, 1000, 1000, 1000,
		]);
		await a.repo.update('activity_type', WORK_TYPE_ID, { name: 'Renamed' });
		await a.repo.remove('activity_type', PERSONAL_TYPE_ID);
		await a.repo.ensureSeeded();
		expect((await a.db.activity_type.get(WORK_TYPE_ID))?.name).toBe('Renamed');
		expect((await a.db.activity_type.get(PERSONAL_TYPE_ID))?.deleted_at).not.toBeNull();
		await assertReplay(a.db);
		await assertReplay(b.db);
	});

	it('rolls back all seeding if an outbox insert fails', async () => {
		const { db, repo } = fixture();
		const add = db.outbox.add.bind(db.outbox);
		vi.spyOn(db.outbox, 'add').mockImplementation((...args) => {
			if (args[0].mutation.record_id === PERSONAL_TYPE_ID) throw new Error('Seed failed');
			return add(...args);
		});
		await expect(repo.ensureSeeded()).rejects.toThrow('Seed failed');
		expect(await db.activity_type.count()).toBe(0);
		expect(await db.local.count()).toBe(0);
		expect(await db.outbox.count()).toBe(0);
	});

	it('validates writes, detects no-ops, and preserves revisions through edits and restore', async () => {
		const { db, repo, at } = fixture();
		expect(await repo.stop()).toBeNull();
		expect(await repo.update('project', newId(), { name: 'Missing' })).toBeNull();
		expect(await db.local.count()).toBe(0);
		await expect(
			repo.create('work_item', { ...itemFields('Invalid'), type_id: 'invalid' }),
		).rejects.toThrow();
		expect(await db.local.count()).toBe(0);
		const item = await repo.create('work_item', itemFields('Before'));
		expect(await repo.update('work_item', item.id, { name: 'Before' })).toBeNull();
		expect(await db.outbox.count()).toBe(1);
		await expect(repo.update('work_item', item.id, { rev: 10 })).rejects.toThrow();
		at(2000);
		const changed = await repo.update('work_item', item.id, { name: 'After' });
		expect(changed).toMatchObject({ name: 'After', rev: 0, updated_at: 2000 });
		const removed = await repo.remove('work_item', item.id);
		expect((await db.work_item.get(item.id))?.deleted_at).toBe(2000);
		await repo.undo(removed);
		expect((await db.work_item.get(item.id))?.deleted_at).toBeNull();
		await repo.remove('work_item', item.id);
		await repo.restore('work_item', item.id);
		await assertReplay(db);
	});

	it('persists a single device id through concurrent calls and reopening', async () => {
		const { db, repo } = fixture();
		const ids = await Promise.all(Array.from({ length: 20 }, () => repo.deviceId()));
		expect(new Set(ids).size).toBe(1);
		db.close();
		await db.open();
		expect(await createRepo(db).deviceId()).toBe(ids[0]);
		expect(await db.local.count()).toBe(1);
		expect(await db.outbox.count()).toBe(0);
	});

	it('preserves a pulled server revision when editing locally', async () => {
		const { db, repo, at } = fixture();
		const item = await repo.create('work_item', itemFields('Before'));
		// Model a future sync pull; revision ownership stays with the server.
		await db.work_item.put({ ...item, rev: 42 });
		at(2000);
		expect(await repo.update('work_item', item.id, { name: 'After' })).toMatchObject({
			rev: 42,
			name: 'After',
			updated_at: 2000,
			updated_by: await repo.deviceId(),
		});
	});

	it('preserves and queues a conflict when undo restores a subsequently deleted session', async () => {
		const { db, repo, at } = fixture();
		const started = await repo.start();
		at(2000);
		const stopped = (await repo.stop())!;
		at(3000);
		await repo.remove('session', started.session.id);
		at(4000);
		await repo.undo(stopped.undo);
		expect((await repo.running())[0]?.id).toBe(started.session.id);
		expect(await db.conflict.count()).toBe(1);
		expect((await db.conflict.toArray())[0]).toMatchObject({
			entity: 'session',
			field: 'deleted_at',
			kept_value: null,
			other_value: 3000,
		});
		expect((await db.outbox.toArray()).at(-1)?.mutation.entity).toBe('conflict');
		await assertReplay(db);
	});

	it('undoes start and can switch when nothing is running', async () => {
		const { db, repo } = fixture();
		const first = await repo.start();
		await repo.undo(first.undo);
		expect(await repo.running()).toEqual([]);
		const next = await repo.switchTo({ workItemId: null });
		expect(next.stopped).toBeNull();
		expect(await repo.running()).toHaveLength(1);
		await assertReplay(db);
	});
});

it('replaying the outbox reproduces every store for random repository sequences (200 runs)', async () => {
	await fc.assert(
		fc.asyncProperty(
			fc.array(
				fc.record({
					operation: fc.integer({ min: 0, max: 9 }),
					text: fc.oneof(fc.string(), fc.constantFrom('库存管理系统开发', '第1寺院', '修复洗手台')),
					index: fc.nat(20),
				}),
				{ minLength: 1, maxLength: 35 },
			),
			async (operations) => {
				const { db, repo, at } = fixture();
				const items: string[] = [];
				const undos: UndoToken[] = [];
				try {
					for (const [i, op] of operations.entries()) {
						at(1000 + i);
						const id = items[op.index % items.length];
						switch (op.operation) {
							case 0:
								items.push((await repo.create('work_item', itemFields(op.text))).id);
								break;
							case 1:
								if (id) await repo.update('work_item', id, { name: op.text });
								break;
							case 2:
								if (id) undos.push(await repo.remove('work_item', id));
								break;
							case 3:
								undos.push((await repo.start({ workItemId: id ?? null })).undo);
								break;
							case 4: {
								const stopped = await repo.stop();
								if (stopped) undos.push(stopped.undo);
								break;
							}
							case 5:
								undos.push((await repo.switchTo({ workItemId: id ?? null })).undo);
								break;
							case 6:
								if (undos.length) await repo.undo(undos.splice(op.index % undos.length, 1)[0]!);
								break;
							case 7:
								await repo.ensureSeeded();
								break;
							case 8:
								if (id) await repo.restore('work_item', id);
								break;
							case 9: {
								const named = await repo.startNamed(op.text);
								items.push(named.workItem.id);
								undos.push(named.undo);
								break;
							}
						}
						await assertReplay(db);
					}
				} finally {
					await db.delete();
					databases.splice(databases.indexOf(db), 1);
				}
			},
		),
		{ numRuns: 200 },
	);
}, 60000);

describe('editMany', () => {
	it('patches several records in one transaction with one undo token', async () => {
		const { db, repo } = fixture();
		const a = await repo.create('project', { name: 'A', archived_at: null });
		const b = await repo.create('project', { name: 'B', archived_at: null });
		const before = await db.outbox.count();
		const undo = await repo.editMany('Rename', [
			{ entity: 'project', id: a.id, changes: { name: '甲' } },
			{ entity: 'project', id: b.id, changes: { name: 'B' } }, // no change: skipped
			{ entity: 'project', id: b.id, changes: { archived_at: 5 } },
		]);
		expect(undo.mutations).toHaveLength(2);
		expect((await db.project.get(a.id))?.name).toBe('甲');
		expect((await db.project.get(b.id))?.archived_at).toBe(5);
		expect(await db.outbox.count()).toBe(before + 2);
		await repo.undo(undo);
		expect((await db.project.get(a.id))?.name).toBe('A');
		expect((await db.project.get(b.id))?.archived_at).toBeNull();
	});

	it('writes nothing when any record is missing', async () => {
		const { db, repo } = fixture();
		const a = await repo.create('project', { name: 'A', archived_at: null });
		const before = await db.outbox.count();
		await expect(
			repo.editMany('Rename', [
				{ entity: 'project', id: a.id, changes: { name: 'changed' } },
				{ entity: 'project', id: '00000000-0000-7000-8000-00000000dead', changes: { name: 'x' } },
			]),
		).rejects.toThrow();
		expect((await db.project.get(a.id))?.name).toBe('A');
		expect(await db.outbox.count()).toBe(before);
	});
});

describe('applyPlan', () => {
	it('applies a core split plan in one transaction and undoes it with one token', async () => {
		const { db, repo, at } = fixture();
		at(Date.parse('2026-11-12T13:00:00Z'));
		const session = await repo.create('session', {
			work_item_id: null,
			type_id: WORK_TYPE_ID,
			start_at: Date.parse('2026-11-12T09:00:00Z'),
			end_at: Date.parse('2026-11-12T11:00:00Z'),
			start_tz: 'UTC',
			end_tz: 'UTC',
			note: '修复洗手台',
			source: 'manual',
			place_id: null,
			place_state: 'none',
			place_candidates: [],
			flags: {},
			origin_device_id: 'test',
		});
		const result = planSplit(session, Date.parse('2026-11-12T10:00:00Z'), () => newId());
		if (!result.ok) throw new Error(result.error);
		const undo = await repo.applyPlan('Split', 'session', result.plan);
		const live = (await db.session.toArray()).filter((s) => s.deleted_at === null);
		expect(live).toHaveLength(2);
		expect(live.map((s) => s.end_at).sort()).toEqual([
			Date.parse('2026-11-12T10:00:00Z'),
			Date.parse('2026-11-12T11:00:00Z'),
		]);
		await repo.undo(undo);
		const after = (await db.session.toArray()).filter((s) => s.deleted_at === null);
		expect(after).toHaveLength(1);
		expect(after[0]).toMatchObject({ id: session.id, end_at: session.end_at, note: '修复洗手台' });
	});

	it('writes nothing when a step fails', async () => {
		const { db, repo } = fixture();
		const before = await db.outbox.count();
		await expect(
			repo.applyPlan('Merge', 'project', {
				create: [],
				update: [{ id: '00000000-0000-7000-8000-00000000dead', changes: { name: 'x' } }],
				remove: [],
			}),
		).rejects.toThrow();
		expect(await db.outbox.count()).toBe(before);
	});
});
