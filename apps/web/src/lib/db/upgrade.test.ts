import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it, vi } from 'vitest';
import { DEFAULT_ACTIVITY_TYPES, ENTITIES, newId, putMutation } from '@hourtrail/core';
import { SyncEngine } from '$lib/features/sync/engine.svelte';
import { openDb, V1_STORES } from './schema';

// Keep each historical fixture and its stores unchanged. For v2, add
// version(2).stores(...).upgrade(...) to HourtrailDB and a fixture test opening
// v1 here before reopening with the current schema. Repeat for every version.
async function upgradeFixture(
	version: number,
	stores: Record<string, string>,
	seed: (db: Dexie) => Promise<void>,
	assert: (db: ReturnType<typeof openDb>) => Promise<void>,
) {
	const name = `upgrade-${newId()}`;
	const previous = new Dexie(name);
	previous.version(version).stores(stores);
	const current = openDb(name);
	try {
		await previous.open();
		await seed(previous);
		previous.close();
		await current.open();
		await assert(current);
	} finally {
		previous.close();
		await current.delete();
	}
}

it('reopens a v1 fixture without losing entities, pending mutations or local data', async () => {
	const type = { ...DEFAULT_ACTIVITY_TYPES[0]!, updated_by: 'fixture-device' };
	const mutation = putMutation('activity_type', type, { now: 0, deviceId: 'fixture-device' });
	const outbox = { seq: 7, mutation, batch_id: newId(), queued_at: 1000 };
	const fix = {
		id: `${newId()}:start`,
		session_id: newId(),
		kind: 'start',
		lat: 44,
		lng: -63,
		accuracy_m: 10,
		captured_at: 1000,
	};
	const local = { key: 'device_id', value: 'fixture-device' };
	await upgradeFixture(
		1,
		V1_STORES,
		async (db) => {
			await db.table('activity_type').put(type);
			await db.table('outbox').put(outbox);
			await db.table('local_fix').put(fix);
			await db.table('local').put(local);
		},
		async (db) => {
			expect(db.verno).toBe(1);
			expect(db.tables.map((table) => table.name).sort()).toEqual(
				[...ENTITIES, 'outbox', 'local_fix', 'local'].sort(),
			);
			expect(await db.activity_type.toArray()).toEqual([type]);
			expect(await db.outbox.toArray()).toEqual([outbox]);
			expect(await db.local_fix.toArray()).toEqual([fix]);
			expect(await db.local.toArray()).toEqual([local]);
			expect(await db.outbox.add({ mutation, batch_id: null, queued_at: 2000 })).toBe(8);
			expect(db.session.schema.indexes.map((index) => index.name)).toEqual([
				'start_at',
				'end_at',
				'work_item_id',
				'updated_at',
			]);
			expect(db.work_item.schema.indexes.map((index) => index.name)).toEqual([
				'name',
				'pinned_at',
				'archived_at',
				'updated_at',
			]);
			for (const entity of ENTITIES.filter(
				(entity) => !['session', 'work_item'].includes(entity),
			)) {
				expect(db.entity(entity).schema.indexes.map((index) => index.name)).toEqual(['updated_at']);
			}
		},
	);
});

it('loads and pushes a pre-restore v1 outbox row without a mode as an ordinary batch', async () => {
	const record = { ...DEFAULT_ACTIVITY_TYPES[0]!, updated_by: 'fixture-device' };
	const mutation = putMutation('activity_type', record, { now: 0, deviceId: 'fixture-device' });
	await upgradeFixture(
		1,
		V1_STORES,
		async (old) => {
			await old.table('outbox').put({ seq: 1, mutation, batch_id: null, queued_at: 1000 });
			await old.table('local').put({ key: 'device_id', value: 'fixture-device' });
		},
		async (db) => {
			const posted: unknown[] = [];
			const engine = new SyncEngine({
				db,
				isSignedIn: () => true,
				handleUnauthorized: () => undefined,
				request: (async (path, options) => {
					if (path === '/api/sync/push') {
						const body = options.body as { batch_id: string };
						posted.push(body);
						return { batch_id: body.batch_id, seq: 1, applied: 1, rejected: [], server_time: 1000 };
					}
					return { records: [], next_since: 0, more: false, server_time: 1000 };
				}) as ConstructorParameters<typeof SyncEngine>[0]['request'],
			});
			try {
				engine.start();
				await vi.waitFor(() => expect(engine.status).toBe('synced'));
				expect(db.verno).toBe(1);
				expect(posted).toHaveLength(1);
				expect(posted[0]).not.toHaveProperty('mode');
				expect(posted[0]).toMatchObject({ mutations: [mutation] });
				expect(await db.outbox.count()).toBe(0);
			} finally {
				engine.stop();
			}
		},
	);
});
