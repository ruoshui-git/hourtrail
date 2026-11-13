import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@hourtrail/core';
import type { RecordOf } from '@hourtrail/core';
import { ApiError, OfflineError } from '$lib/api/client';
import { createRepo } from '$lib/db/repo';
import { openDb } from '$lib/db/schema';
import type { HourtrailDB } from '$lib/db/schema';
import { SyncEngine } from './engine.svelte';

const databases: HourtrailDB[] = [];
type RequestOptions = {
	method?: string;
	body?: { batch_id: string; mutations: { id: string; record_id: string }[] };
	schema: { parse(value: unknown): unknown };
};
const waitFor = async (predicate: () => Promise<boolean>) => {
	const limit = Date.now() + 5000;
	while (Date.now() < limit) {
		if (await predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error('Timed out waiting for sync state.');
};

function fixture(request: (path: string, options: RequestOptions) => Promise<unknown>) {
	const database = openDb(`sync-${newId()}`);
	databases.push(database);
	const repository = createRepo(database, () => 1000);
	const engine = new SyncEngine({
		db: database,
		isSignedIn: () => true,
		handleUnauthorized: () => undefined,
		request: request as never,
		clock: () => 1000,
		id: () => newId(1000),
	});
	return { database, repository, engine };
}

afterEach(async () => {
	for (const database of databases.splice(0)) await database.delete();
});

describe('sync engine', () => {
	it('assigns a batch before sending, removes its acknowledged rows, and preserves rejections', async () => {
		let posted: RequestOptions['body'];
		let requests = 0;
		const { database, repository, engine } = fixture(async (path, options) => {
			if (path === '/api/sync/push') {
				requests++;
				if (requests > 1) throw new OfflineError();
				posted = options.body;
				await repository.create('project', { name: 'Arrived during push', archived_at: null });
				return {
					batch_id: options.body!.batch_id,
					seq: 1,
					applied: 0,
					rejected: [{ mutation_id: options.body!.mutations[0]!.id, reason: 'Rejected for test.' }],
					server_time: 1000,
				};
			}
			return { records: [], next_since: 0, more: false, server_time: 1000 };
		});
		await database.local.put({ key: 'device_id', value: 'device' });
		await repository.create('project', { name: 'Test', archived_at: null });
		engine.start();
		await waitFor(async () => engine.status === 'offline');
		expect(posted!.batch_id).toMatch(/^[0-9a-f-]{36}$/);
		expect(posted!.mutations).toHaveLength(1);
		expect(await database.outbox.count()).toBe(1);
		expect(engine.rejected).toMatchObject([
			{
				mutation_id: posted!.mutations[0]!.id,
				entity: 'project',
				record_id: posted!.mutations[0]!.record_id,
			},
		]);
		expect((await database.local.get('sync_rejected'))?.value).toEqual(engine.rejected);
		engine.stop();
	});

	it('reuses the persisted batch and its exact mutations after a lost response', async () => {
		const sent: { batch_id: string; ids: string[] }[] = [];
		let failFirst = true;
		const { database, repository, engine } = fixture(async (path, options) => {
			if (path === '/api/sync/push') {
				sent.push({
					batch_id: options.body!.batch_id,
					ids: options.body!.mutations.map((mutation) => mutation.id),
				});
				if (failFirst) {
					failFirst = false;
					throw new OfflineError();
				}
				return {
					batch_id: options.body!.batch_id,
					seq: 1,
					applied: 1,
					rejected: [],
					server_time: 1000,
				};
			}
			return { records: [], next_since: 0, more: false, server_time: 1000 };
		});
		await database.local.put({ key: 'device_id', value: 'device' });
		await repository.create('project', { name: 'Retry this batch', archived_at: null });
		engine.start();
		await waitFor(async () => engine.status === 'offline');
		await engine.syncNow();
		await waitFor(async () => engine.status === 'synced' && (await database.outbox.count()) === 0);
		expect(sent).toHaveLength(2);
		expect(sent[1]).toEqual(sent[0]);
		engine.stop();
	});

	it('replays pending edits over pulled records and advances the cursor in the same page transaction', async () => {
		const repositoryRef: { current: ReturnType<typeof createRepo> | null } = { current: null };
		const serverRecord: { current: RecordOf<'project'> | null } = { current: null };
		const { database, engine } = fixture(async (path, options) => {
			if (path === '/api/sync/push') {
				serverRecord.current = (await database.project.toCollection().first())!;
				await repositoryRef.current!.update('project', serverRecord.current.id, {
					name: 'Newest local edit',
				});
				return {
					batch_id: options.body!.batch_id,
					seq: 1,
					applied: 1,
					rejected: [],
					server_time: 1000,
				};
			}
			if (path.startsWith('/api/sync/pull')) {
				return {
					records: [{ entity: 'project', record: { ...serverRecord.current!, rev: 2 } }],
					next_since: 2,
					more: false,
					server_time: 1000,
				};
			}
			throw new Error(`Unexpected request: ${path}`);
		});
		repositoryRef.current = createRepo(database, () => 1000);
		await database.local.put({ key: 'device_id', value: 'device' });
		const project = await repositoryRef.current.create('project', {
			name: 'Before',
			archived_at: null,
		});
		await repositoryRef.current.update('project', project.id, { name: 'Local edit' });
		engine.start();
		await waitFor(async () => engine.status === 'synced' && (await database.outbox.count()) === 0);
		expect((await database.project.get(project.id))?.name).toBe('Newest local edit');
		expect((await database.local.get('sync_cursor'))?.value).toBe(2);
		engine.stop();
	});

	it('stops and signs out on 401', async () => {
		const unauthorized = vi.fn();
		const database = openDb(`sync-${newId()}`);
		databases.push(database);
		const engine = new SyncEngine({
			db: database,
			isSignedIn: () => true,
			handleUnauthorized: unauthorized,
			request: (async () => {
				throw new ApiError(401, 'unauthorized', 'Sign in again.');
			}) as never,
		});
		engine.start();
		await waitFor(async () => engine.status === 'local' && unauthorized.mock.calls.length === 1);
		expect(unauthorized).toHaveBeenCalledOnce();
	});

	it('restores device-only rejected mutations when the engine starts again', async () => {
		const rejected = [
			{
				mutation_id: newId(),
				entity: 'project',
				record_id: newId(),
				reason: 'The server rejected this edit.',
				at: 1000,
			},
		];
		const { database, engine } = fixture(async () => ({
			records: [],
			next_since: 0,
			more: false,
			server_time: 1000,
		}));
		await database.local.put({ key: 'sync_rejected', value: rejected });
		engine.start();
		await waitFor(async () => engine.status === 'synced');
		expect(engine.rejected).toEqual(rejected);
		engine.stop();
	});

	it('backs off from two seconds and doubles after another failure', async () => {
		const calls = vi.fn(async () => {
			throw new ApiError(503, 'conflict_retry', 'Please retry the request.');
		});
		const timeout = vi.spyOn(globalThis, 'setTimeout');
		const { engine } = fixture(async () => calls());
		engine.start();
		await waitFor(async () => engine.status === 'error' && calls.mock.calls.length === 1);
		expect(timeout.mock.calls.some(([, ms]) => ms === 2000)).toBe(true);
		await engine.syncNow();
		await waitFor(async () => engine.status === 'error' && calls.mock.calls.length === 2);
		expect(timeout.mock.calls.some(([, ms]) => ms === 4000)).toBe(true);
		engine.stop();
		timeout.mockRestore();
	});

	it('does not advance the cursor or write any record from an invalid pull page', async () => {
		const { database, engine } = fixture(async () => ({
			records: [{ entity: 'project', record: { id: 'invalid', rev: 3 } }],
			next_since: 3,
			more: false,
			server_time: 1000,
		}));
		engine.start();
		await waitFor(async () => engine.status === 'error');
		expect(await database.project.count()).toBe(0);
		expect(await database.local.get('sync_cursor')).toBeUndefined();
		engine.stop();
	});

	it('keeps one network request in flight and schedules one follow-up', async () => {
		let resolvePull!: (value: unknown) => void;
		let calls = 0;
		const { engine } = fixture(async () => {
			calls++;
			return await new Promise((resolve) => (resolvePull = resolve));
		});
		engine.start();
		await waitFor(async () => calls === 1);
		await engine.syncNow();
		await engine.syncNow();
		resolvePull({ records: [], next_since: 0, more: false, server_time: 1000 });
		await waitFor(async () => calls === 2);
		resolvePull({ records: [], next_since: 0, more: false, server_time: 1000 });
		await waitFor(async () => engine.status === 'synced');
		expect(calls).toBe(2);
		engine.stop();
	});
});
