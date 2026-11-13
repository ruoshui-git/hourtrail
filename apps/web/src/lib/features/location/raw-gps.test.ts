import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '@hourtrail/core';
import { createRepo } from '$lib/db/repo';
import { openDb, type HourtrailDB } from '$lib/db/schema';
import { deleteCloudRawCoordinates, enableRawCoordinateSync, saveCapturedFix } from './raw-gps';

const databases: HourtrailDB[] = [];
function fixture() {
	const db = openDb(`raw-gps-${newId()}`);
	databases.push(db);
	const repo = createRepo(db, () => 1000);
	return { db, repo };
}

afterEach(async () => {
	await Promise.all(databases.splice(0).map((database) => database.delete()));
});

describe('raw coordinate sync', () => {
	it('keeps captured fixes local with sync off and creates a synced record when on', async () => {
		const { db, repo } = fixture();
		const session_id = newId(10);
		const fields = {
			session_id,
			kind: 'start' as const,
			lat: 45.5,
			lng: -63.5,
			accuracy_m: 4,
			captured_at: 100,
		};

		await saveCapturedFix(db, repo, fields, false);
		expect(await db.local_fix.get(`${session_id}:start`)).toMatchObject(fields);
		expect(await db.session_fix.count()).toBe(0);

		await saveCapturedFix(db, repo, { ...fields, session_id: newId(20) }, true);
		expect(await db.session_fix.count()).toBe(1);
		expect((await db.outbox.toArray()).at(-1)?.mutation).toMatchObject({
			kind: 'put',
			entity: 'session_fix',
		});
	});

	it('converts all local fixes into synced records and clears local copies', async () => {
		const { db, repo } = fixture();
		const first = newId(10);
		const second = newId(20);
		await db.local_fix.bulkPut([
			{
				id: `${first}:start`,
				session_id: first,
				kind: 'start',
				lat: 45.5,
				lng: -63.5,
				accuracy_m: 4,
				captured_at: 100,
			},
			{
				id: `${second}:end`,
				session_id: second,
				kind: 'end',
				lat: 45.6,
				lng: -63.4,
				accuracy_m: 8,
				captured_at: 200,
			},
		]);

		await enableRawCoordinateSync(db, repo);
		expect(await db.local_fix.count()).toBe(0);
		expect(await db.session_fix.count()).toBe(2);
		expect((await db.session_fix.get(`${first}:start`))?.lat).toBe(45.5);
	});

	it('copies each cloud fix locally, then queues a scrub patch before its tombstone', async () => {
		const { db, repo } = fixture();
		const firstId = newId(10);
		const first = await repo.create('session_fix', {
			id: `${firstId}:start`,
			session_id: firstId,
			kind: 'start',
			lat: 45.5,
			lng: -63.5,
			accuracy_m: 4,
			captured_at: 100,
		});
		const secondId = newId(20);
		await repo.create('session_fix', {
			id: `${secondId}:end`,
			session_id: secondId,
			kind: 'end',
			lat: 45.6,
			lng: -63.4,
			accuracy_m: 8,
			captured_at: 200,
		});

		await deleteCloudRawCoordinates(db, repo);

		const queued = (await db.outbox.toArray()).slice(2).map((row) => row.mutation);
		expect(queued.map((mutation) => [mutation.kind, mutation.record_id])).toEqual([
			['patch', first.id],
			['delete', first.id],
			['patch', `${secondId}:end`],
			['delete', `${secondId}:end`],
		]);
		for (const id of [first.id, `${secondId}:end`]) {
			const record = await db.session_fix.get(id);
			expect(record).toMatchObject({ lat: 0, lng: 0, accuracy_m: 0 });
			expect(record?.deleted_at).not.toBeNull();
		}
		expect(await db.local_fix.count()).toBe(2);
	});

	it('re-enabling sync after a cloud deletion revives the scrubbed record instead of re-creating it', async () => {
		const { db, repo } = fixture();
		const session_id = newId(10);
		const fields = {
			session_id,
			kind: 'start' as const,
			lat: 45.5,
			lng: -63.5,
			accuracy_m: 4,
			captured_at: 100,
		};
		await saveCapturedFix(db, repo, fields, true);
		await deleteCloudRawCoordinates(db, repo);
		expect((await db.session_fix.get(`${session_id}:start`))?.deleted_at).not.toBeNull();
		const queued = await db.outbox.count();

		await enableRawCoordinateSync(db, repo);

		const revived = await db.session_fix.get(`${session_id}:start`);
		expect(revived).toMatchObject({ ...fields, deleted_at: null });
		expect(await db.local_fix.count()).toBe(0);
		const kinds = (await db.outbox.toArray()).slice(queued).map((row) => row.mutation.kind);
		// undelete then patch: never a put, which the server would reject for a tombstone.
		expect(kinds).toEqual(['undelete', 'patch']);
	});
});
