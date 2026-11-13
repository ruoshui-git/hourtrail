import {
	applyMutation,
	batchSchema,
	MutationError,
	pullQuerySchema,
	type AnyRecord,
	type Entity,
	type PushAck,
} from '@hourtrail/core';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireDevice } from '../auth';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { parseJson, parseQuery } from '../validate';

export const sync = new Hono<AppEnv>();
type StoredRecord = { entity: Entity; data: string };
const key = (entity: Entity, id: string) => JSON.stringify([entity, id]);

sync.post('/push', requireDevice, async (c) => {
	// Check identity before batchSchema's cross-mutation refinement so every device
	// mismatch uses the same public error, including a mismatched mutation alone.
	const input = await parseJson(c, z.unknown());
	if (input !== null && typeof input === 'object') {
		const raw = input as Record<string, unknown>;
		if (
			(typeof raw.device_id === 'string' && raw.device_id !== c.var.device.id) ||
			(Array.isArray(raw.mutations) &&
				raw.mutations.some(
					(m: unknown) =>
						m !== null &&
						typeof m === 'object' &&
						'device_id' in m &&
						typeof m.device_id === 'string' &&
						m.device_id !== c.var.device.id,
				))
		) {
			throw new ApiError(400, 'invalid_request', 'Batch device does not match this device.');
		}
	}
	const parsed = batchSchema.safeParse(input);
	if (!parsed.success) throw new ApiError(400, 'invalid_request', 'The request is not valid.');
	const batch = parsed.data;
	const db = c.env.DB;
	const targets = new Map(
		batch.mutations.map((m) => [key(m.entity, m.record_id), [m.entity, m.record_id]]),
	);
	const targetValues = [...targets.values()];
	const selectRecords = targetValues.length
		? db
				.prepare(
					`SELECT entity, data FROM records WHERE (entity, id) IN
					(VALUES ${targetValues.map(() => '(?, ?)').join(', ')})`,
				)
				.bind(...targetValues.flat())
		: db.prepare('SELECT entity, data FROM records WHERE 0');
	let writes = 0;
	let failure: { error: unknown; seq: number } | undefined;
	for (;;) {
		const reads = await db.batch([
			db.prepare('SELECT ack FROM sync_batches WHERE batch_id = ?').bind(batch.batch_id),
			db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM sync_batches'),
			selectRecords,
		]);
		const stored = reads[0]!.results[0] as { ack: string } | undefined;
		if (stored) {
			return c.json({ ...(JSON.parse(stored.ack) as PushAck), server_time: Date.now() });
		}
		const max = (reads[1]!.results[0] as { seq: number }).seq;
		if (failure) {
			// Re-read state to distinguish a seq collision, a duplicate batch, and
			// an unrelated failure. Do not depend on D1's error message wording.
			if (max < failure.seq) throw failure.error;
			if (writes === 3) {
				throw new ApiError(503, 'conflict_retry', 'Please retry the request.');
			}
		}
		const seq = max + 1;
		const now = Date.now();
		const current = new Map<string, AnyRecord>();
		for (const row of reads[2]!.results as StoredRecord[]) {
			const record = JSON.parse(row.data) as AnyRecord;
			current.set(key(row.entity, record.id), record);
		}
		const changed = new Map<string, { entity: Entity; record: AnyRecord }>();
		const ack: PushAck = {
			batch_id: batch.batch_id,
			seq,
			applied: 0,
			rejected: [],
			server_time: now,
		};
		function store(entity: Entity, record: AnyRecord) {
			const id = key(entity, record.id);
			current.set(id, record);
			changed.set(id, { entity, record });
		}
		for (const mutation of batch.mutations) {
			try {
				const result = applyMutation(
					current.get(key(mutation.entity, mutation.record_id)) ?? null,
					mutation,
					{ now, rev: seq, mode: batch.mode },
				);
				if (result.changed && result.next) store(mutation.entity, result.next);
				for (const conflict of result.conflicts) store('conflict', conflict);
				// A losing mutation can leave the target unchanged and still write a conflict.
				if (result.changed || result.conflicts.length) ack.applied++;
			} catch (error) {
				if (!(error instanceof MutationError)) throw error;
				ack.rejected.push({ mutation_id: mutation.id, reason: error.message });
			}
		}
		const statements = [
			db
				.prepare(
					'INSERT INTO sync_batches (seq, batch_id, device_id, received_at, ack) VALUES (?, ?, ?, ?, ?)',
				)
				.bind(seq, batch.batch_id, batch.device_id, now, JSON.stringify(ack)),
			...[...changed.values()].map(({ entity, record }) =>
				db
					.prepare(
						`INSERT INTO records (entity, id, rev, updated_at, deleted_at, data)
						VALUES (?, ?, ?, ?, ?, ?)
						ON CONFLICT(entity, id) DO UPDATE SET rev = excluded.rev,
						updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, data = excluded.data`,
					)
					.bind(
						entity,
						record.id,
						seq,
						record.updated_at,
						record.deleted_at,
						JSON.stringify(record),
					),
			),
		];
		writes++;
		try {
			await db.batch(statements);
			return c.json(ack);
		} catch (error) {
			failure = { error, seq };
		}
	}
});

sync.get('/pull', requireDevice, async (c) => {
	const { since, limit } = parseQuery(c, pullQuerySchema);
	// At most limit+1 distinct revs are needed: each holds at least one record.
	const groups = await c.env.DB.prepare(
		`SELECT rev, COUNT(*) AS count FROM records WHERE rev > ?
		GROUP BY rev ORDER BY rev LIMIT ?`,
	)
		.bind(since, limit + 1)
		.all<{ rev: number; count: number }>();
	let size = 0;
	let selected = 0;
	let next = since;
	for (const group of groups.results) {
		if (selected > 0 && size + group.count > limit) break;
		size += group.count;
		selected++;
		next = group.rev;
	}
	const rows = selected
		? (
				await c.env.DB.prepare(
					'SELECT entity, data FROM records WHERE rev > ? AND rev <= ? ORDER BY rev, entity, id',
				)
					.bind(since, next)
					.all<StoredRecord>()
			).results
		: [];
	return c.json({
		records: rows.map((row) => ({ entity: row.entity, record: JSON.parse(row.data) as AnyRecord })),
		next_since: next,
		more: selected < groups.results.length,
		server_time: Date.now(),
	});
});
