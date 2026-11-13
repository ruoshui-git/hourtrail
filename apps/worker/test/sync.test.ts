import { env } from 'cloudflare:test';
import { deleteMutation, newId, putMutation, schemas, type Mutation } from '@hourtrail/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectError } from './helpers';
import {
	batch,
	clearSync,
	deviceA,
	deviceB,
	now,
	patch,
	proxiedDB,
	pull,
	push,
	request,
	session,
	signedIn,
	snapshot,
} from './sync-helpers';

let cookieA: string;
let cookieB: string;
beforeEach(async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(now);
	await clearSync();
	await env.DB.batch([
		env.DB.prepare('DELETE FROM link_codes'),
		env.DB.prepare('DELETE FROM devices'),
		env.DB.prepare('DELETE FROM meta'),
	]);
	cookieA = await signedIn(deviceA);
	cookieB = await signedIn(deviceB);
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function put(record = session(), device = deviceA) {
	return putMutation('session', record, { now, deviceId: device });
}
async function seed(record = session()) {
	await push(batch([put(record)]), cookieA);
	return record;
}
async function competingBatch() {
	await env.DB.prepare(
		`INSERT INTO sync_batches (seq, batch_id, device_id, received_at, ack)
		SELECT COALESCE(MAX(seq), 0) + 1, ?, ?, ?, '{}' FROM sync_batches`,
	)
		.bind(newId(now), deviceB, now)
		.run();
}

describe('sync push, pull and validation', () => {
	it('round-trips Chinese records to a second device with server revisions and within D1 budgets', async () => {
		const records = ['库存管理系统开发', '第1寺院', '修复洗手台'].map(session);
		const input = batch(records.map((record) => put(record)));
		const countedPush = proxiedDB();
		const ack = await push(input, cookieA, countedPush.bindings);
		expect(ack).toEqual({
			batch_id: input.batch_id,
			seq: 1,
			applied: 3,
			rejected: [],
			server_time: now,
		});
		expect(countedPush.calls()).toBeLessThanOrEqual(3);
		expect(countedPush.batches).toHaveLength(2);
		const countedPull = proxiedDB();
		const page = await pull(cookieB, '', countedPull.bindings);
		expect(countedPull.calls()).toBeLessThanOrEqual(3);
		expect(page).toMatchObject({ next_since: 1, more: false, server_time: now });
		expect(page.records).toEqual(
			records
				.map((record) => ({ entity: 'session', record: { ...record, rev: 1, updated_at: now } }))
				.sort((a, b) => a.record.id.localeCompare(b.record.id)),
		);
		for (const { entity, record } of page.records)
			expect(schemas[entity].safeParse(record).success).toBe(true);
	});
	it('applies repeated targets in order, rejects only missing patches and skips unchanged records', async () => {
		const record = session();
		const missing = patch(newId(now), 'original', 'missing');
		const ack = await push(
			batch([
				put(record),
				patch(record.id, 'original', 'A'),
				missing,
				patch(record.id, 'A', 'C', deviceA, now + 200),
				patch(record.id, 'C', 'C'),
				deleteMutation('session', newId(now), { now, deviceId: deviceA }),
			]),
			cookieA,
		);
		expect(ack.applied).toBe(3);
		expect(ack.rejected).toEqual([
			{ mutation_id: missing.id, reason: 'Cannot patch a missing record' },
		]);
		expect((await pull(cookieA)).records).toMatchObject([
			{ entity: 'session', record: { id: record.id, note: 'C', rev: 1 } },
		]);
		const before = await snapshot();
		const counted = proxiedDB();
		expect(
			(await push(batch([patch(record.id, 'C', 'C')]), cookieA, counted.bindings)).applied,
		).toBe(0);
		expect(counted.batches[1]).toHaveLength(1);
		expect(await snapshot()).toEqual(before);
	});
	it('replays sequentially with a fresh server time and no writes', async () => {
		const input = batch([put()]);
		const first = await push(input, cookieA);
		const before = await snapshot();
		vi.setSystemTime(now + 1);
		const counted = proxiedDB();
		const replay = await push(input, cookieA, counted.bindings);
		expect(replay).toEqual({ ...first, server_time: now + 1 });
		expect(counted.calls()).toBeLessThanOrEqual(2);
		expect(counted.batches).toHaveLength(1);
		expect(await snapshot()).toEqual(before);
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_batches').first('n')).toBe(1);
	});
	it('deduplicates concurrent replay, including its conflict record', async () => {
		const record = await seed();
		await push(batch([patch(record.id, 'original', 'A')]), cookieA);
		const input = batch([patch(record.id, 'original', 'B', deviceB, now + 200)], deviceB);
		const [first, second] = await Promise.all([push(input, cookieB), push(input, cookieB)]);
		expect(first).toEqual(second);
		const before = await snapshot();
		expect((await pull(cookieA)).records.filter((r) => r.entity === 'conflict')).toHaveLength(1);
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_batches').first('n')).toBe(3);
		expect(await push(input, cookieB)).toEqual(first);
		expect(await snapshot()).toEqual(before);
	});
	it('serializes different concurrent batches into consecutive revisions', async () => {
		const record = await seed();
		const a = batch([patch(record.id, 'original', 'A')]);
		const b = batch([patch(record.id, 'original', 'B', deviceB, now + 200)], deviceB);
		const acks = await Promise.all([push(a, cookieA), push(b, cookieB)]);
		expect(acks.map((a) => a.seq).sort()).toEqual([2, 3]);
		const rows = (await pull(cookieA)).records;
		expect(rows.find((r) => r.entity === 'session')!.record.note).toBe('B');
		expect(rows.filter((r) => r.entity === 'conflict')).toHaveLength(1);
	});
	it('clamps future edit times to five minutes ahead', async () => {
		const record = await seed();
		await push(batch([patch(record.id, 'original', 'future', deviceA, now + 600_000)]), cookieA);
		expect((await pull(cookieA)).records[0]!.record.updated_at).toBe(now + 300_000);
	});
	it('passes restore mode through for existing records', async () => {
		const record = await seed();
		const restored = { ...record, note: 'restored', start_at: now - 5000 };
		const ack = await push({ ...batch([put(restored)]), mode: 'restore' }, cookieA);
		expect(ack.applied).toBe(1);
		expect((await pull(cookieB)).records).toMatchObject([
			{ entity: 'session', record: { note: 'restored', start_at: now - 5000, rev: 2 } },
		]);
	});
	it('includes tombstones, then restores a deleted record with a conflict on patch', async () => {
		const record = await seed();
		const deletion = batch([deleteMutation('session', record.id, { now, deviceId: deviceA })]);
		await push(deletion, cookieA);
		expect((await pull(cookieB, '?since=1')).records).toMatchObject([
			{ entity: 'session', record: { deleted_at: now, rev: 2 } },
		]);
		await push(batch([patch(record.id, 'original', '修复洗手台', deviceB)], deviceB), cookieB);
		const page = await pull(cookieA, '?since=2');
		expect(page.records).toHaveLength(2);
		expect(page.records.find((r) => r.entity === 'session')!.record).toMatchObject({
			deleted_at: null,
			note: '修复洗手台',
			rev: 3,
		});
		expect(page.records.find((r) => r.entity === 'conflict')!.record).toMatchObject({
			record_id: record.id,
			field: 'deleted_at',
			rev: 3,
		});
	});
	it('requires a live device for both routes', async () => {
		await env.DB.prepare('UPDATE devices SET revoked_at = ? WHERE id = ?').bind(now, deviceA).run();
		for (const cookie of [undefined, cookieA]) {
			await expectError(await request('sync/push', 'POST', batch([]), cookie), 401, 'unauthorized');
			await expectError(await request('sync/pull', 'GET', undefined, cookie), 401, 'unauthorized');
		}
	});
	it('rejects mismatched devices, oversized batches, malformed bodies and invalid queries', async () => {
		for (const input of [batch([], deviceB), batch([patch(newId(now), '', '', deviceB)])]) {
			const error = await expectError(
				await request('sync/push', 'POST', input, cookieA),
				400,
				'invalid_request',
			);
			expect(error.error.message).toBe('Batch device does not match this device.');
		}
		for (const input of [
			batch(Array.from({ length: 51 }, () => put())),
			{},
			null,
			batch([{ ...put(), kind: 'bad' } as unknown as Mutation]),
		]) {
			await expectError(await request('sync/push', 'POST', input, cookieA), 400, 'invalid_request');
		}
		for (const query of ['?since=-1', '?since=1.5', '?limit=0', '?limit=501', '?since=no']) {
			await expectError(
				await request(`sync/pull${query}`, 'GET', undefined, cookieA),
				400,
				'invalid_request',
			);
		}
		expect(await snapshot()).toEqual([]);
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_batches').first('n')).toBe(0);
	});
	it('reports the wall time of a maximum-size batch', async () => {
		const input = batch(Array.from({ length: 50 }, () => put(session('库存管理系统开发'))));
		const counted = proxiedDB();
		const start = performance.now();
		const ack = await push(input, cookieA, counted.bindings);
		console.info(`sync push 50 mutations: ${(performance.now() - start).toFixed(2)} ms wall time`);
		expect(ack.applied).toBe(50);
		expect(counted.calls()).toBeLessThanOrEqual(3);
		expect((await pull(cookieB)).records).toHaveLength(50);
	});
});

describe('atomic writes and deterministic races', () => {
	it('retries after a competing sequence insert and commits exactly once', async () => {
		let attempts = 0;
		const counted = proxiedDB(async () => {
			if (++attempts === 1) await competingBatch();
		});
		const ack = await push(batch([put()]), cookieA, counted.bindings);
		expect(ack.seq).toBe(2);
		expect(attempts).toBe(2);
		expect(counted.batches).toHaveLength(4);
		expect((await pull(cookieA)).records).toMatchObject([{ record: { rev: 2 } }]);
	});
	it('returns conflict_retry after exactly three lost races without writing any of its records', async () => {
		let attempts = 0;
		const counted = proxiedDB(async () => {
			attempts++;
			await competingBatch();
		});
		const input = batch([put(), put()]);
		await expectError(
			await request('sync/push', 'POST', input, cookieA, counted.bindings),
			503,
			'conflict_retry',
		);
		expect(attempts).toBe(3);
		expect(await snapshot()).toEqual([]);
		expect(
			await env.DB.prepare('SELECT ack FROM sync_batches WHERE batch_id = ?')
				.bind(input.batch_id)
				.first(),
		).toBeNull();
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_batches').first('n')).toBe(3);
	});
	it('rereads and returns the winning ack when the duplicate wins the write race', async () => {
		const input = batch([put()]);
		let winning: Awaited<ReturnType<typeof push>> | undefined;
		const counted = proxiedDB(async () => {
			winning = await push(input, cookieA);
		});
		expect(await push(input, cookieA, counted.bindings)).toEqual(winning);
		expect(counted.batches).toHaveLength(3);
		expect(await snapshot()).toHaveLength(1);
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_batches').first('n')).toBe(1);
	});
	it('rolls the ack and all writes back on unrelated D1 failures and returns 500', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const failing = session();
		const input = batch([put(), put(failing)]);
		await env.DB.prepare(
			`CREATE TRIGGER fail_sync_test BEFORE INSERT ON records
		WHEN NEW.id = '${failing.id}'
		BEGIN SELECT RAISE(ABORT, 'opaque write failure'); END`,
		).run();
		try {
			await expectError(await request('sync/push', 'POST', input, cookieA), 500, 'internal');
			expect(await snapshot()).toEqual([]);
			expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_batches').first('n')).toBe(0);
		} finally {
			await env.DB.prepare('DROP TRIGGER fail_sync_test').run();
		}
	});
});

describe('whole-revision pull paging', () => {
	it.each([4, 2])(
		'pages revisions of 2, 3, 2 records with limit=%s without omissions or repeats',
		async (limit) => {
			const ids: string[] = [];
			for (const count of [2, 3, 2]) {
				const records = Array.from({ length: count }, () => session());
				ids.push(...records.map((r) => r.id));
				await push(batch(records.map((record) => put(record))), cookieA);
			}
			const seen: string[] = [];
			for (const [since, size] of [
				[0, 2],
				[1, 3],
				[2, 2],
			] as const) {
				const page = await pull(cookieB, `?since=${since}&limit=${limit}`);
				expect(page).toMatchObject({ next_since: since + 1, more: since < 2, server_time: now });
				expect(page.records).toHaveLength(size);
				expect(page.records.every((r) => r.record.rev === since + 1)).toBe(true);
				seen.push(...page.records.map((r) => r.record.id));
			}
			expect(seen.sort()).toEqual(ids.sort());
			expect(new Set(seen).size).toBe(ids.length);
			expect(await pull(cookieB, '?since=3')).toEqual({
				records: [],
				next_since: 3,
				more: false,
				server_time: now,
			});
		},
	);
	it('combines complete revs that fit and handles empty or future cursors', async () => {
		expect(await pull(cookieA, '?since=9&limit=1')).toEqual({
			records: [],
			next_since: 9,
			more: false,
			server_time: now,
		});
		await push(batch([put(), put()]), cookieA);
		await push(batch([put()]), cookieA);
		const page = await pull(cookieB, '?limit=3');
		expect(page.records.map((r) => r.record.rev)).toEqual([1, 1, 2]);
		expect(page).toMatchObject({ next_since: 2, more: false });
	});
});
