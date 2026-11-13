import { env } from 'cloudflare:test';
import { putMutation, schemas, type Batch, type Mutation } from '@hourtrail/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	batch,
	clearSync,
	deviceA,
	deviceB,
	now,
	patch,
	pull,
	push,
	session,
	signedIn,
	snapshot,
} from './sync-helpers';

let cookieA: string;
let cookieB: string;
const cookie = (device: string) => (device === deviceA ? cookieA : cookieB);

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
afterEach(() => vi.useRealTimers());

function domain(record: Record<string, unknown>) {
	const { rev: _rev, updated_at: _at, updated_by: _by, ...fields } = record;
	return fields;
}
function conflictContent(record: Record<string, unknown>) {
	const { entity, record_id, field, kept_value, other_value, kept_device, other_device } = record;
	return { entity, record_id, field, kept_value, other_value, kept_device, other_device };
}

async function run(initial: ReturnType<typeof session>[], mutations: Mutation[]) {
	await clearSync();
	await push(
		batch(initial.map((record) => putMutation('session', record, { now, deviceId: deviceA }))),
		cookieA,
	);
	const batches: { input: Batch; ack: Awaited<ReturnType<typeof push>> }[] = [];
	for (const mutation of mutations) {
		const input = batch([mutation], mutation.device_id);
		const ack = await push(input, cookie(mutation.device_id));
		expect(ack.rejected).toEqual([]);
		batches.push({ input, ack });
	}
	const before = await snapshot();
	for (const { input, ack } of batches) {
		expect(await push(input, cookie(input.device_id))).toEqual(ack);
		expect(await snapshot()).toEqual(before);
	}
	const records = (await pull(cookieB)).records;
	for (const { entity, record } of records) {
		expect(schemas[entity].safeParse(record).success).toBe(true);
	}
	return records;
}

describe('sync interleavings and conflict preservation', () => {
	it.each([false, true])(
		'keeps the same single conflict content in either order (equal times=%s)',
		async (equalTimes) => {
			const initial = session();
			const a = patch(initial.id, 'original', '库存管理系统开发', deviceA, now + 100);
			const b = patch(
				initial.id,
				'original',
				'修复洗手台',
				deviceB,
				now + (equalTimes ? 100 : 200),
			);
			const ab = await run([initial], [a, b]);
			const ba = await run([initial], [b, a]);
			for (const rows of [ab, ba]) {
				expect(rows.find((r) => r.entity === 'session')!.record.note).toBe('修复洗手台');
				const conflicts = rows.filter((r) => r.entity === 'conflict');
				expect(conflicts).toHaveLength(1);
				expect(conflictContent(conflicts[0]!.record)).toEqual({
					entity: 'session',
					record_id: initial.id,
					field: 'note',
					kept_value: '修复洗手台',
					other_value: '库存管理系统开发',
					kept_device: deviceB,
					other_device: deviceA,
				});
			}
			expect(domain(ab.find((r) => r.entity === 'session')!.record)).toEqual(
				domain(ba.find((r) => r.entity === 'session')!.record),
			);
		},
	);

	it('pins the documented same-value arrival-order behavior (SPEC Mutations rule 5)', async () => {
		// SPEC Mutations rule 5: equal independent after-images can make a later
		// matching before-image apply in only one order; this behavior is accepted.
		const initial = session();
		const a1 = patch(initial.id, 'original', 'A', deviceA, now + 200);
		const a2 = patch(initial.id, 'A', 'C', deviceA, now + 250);
		const b1 = patch(initial.id, 'original', 'A', deviceB, now + 300);
		const ab = await run([initial], [a1, a2, b1]);
		expect(ab.find((r) => r.entity === 'session')!.record.note).toBe('A');
		const conflicts = ab.filter((r) => r.entity === 'conflict');
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]!.record).toMatchObject({
			kept_value: 'A',
			other_value: 'C',
			kept_device: deviceB,
			other_device: deviceA,
		});
		const ba = await run([initial], [b1, a1, a2]);
		expect(ba.find((r) => r.entity === 'session')!.record.note).toBe('C');
		expect(ba.filter((r) => r.entity === 'conflict')).toHaveLength(0);
	});

	it('converges for random unique-value patch sequences, preserves every edit, and replays without writes', async () => {
		// Seeded generation keeps failures reproducible without a new dependency.
		for (let seed = 1; seed <= 20; seed++) {
			let state = seed;
			const random = (max: number) => {
				state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
				return state % max;
			};
			const initial = [session(), session(), session()];
			const queues = [deviceA, deviceB].map((device) => {
				const local = initial.map((record) => record.note);
				return Array.from({ length: 4 + random(5) }, (_, n) => {
					const index = random(initial.length);
					const to = `${device}-${n}-库存管理系统开发-第1寺院-修复洗手台`;
					const mutation = patch(
						initial[index]!.id,
						local[index]!,
						to,
						device,
						now + 100 + n * 10 + (device === deviceB ? 5 : 0),
					);
					local[index] = to;
					return mutation;
				});
			});
			const all = queues.flat();
			const first = [...queues[0]!, ...queues[1]!];
			const remaining = queues.map((queue) => [...queue]);
			const second: Mutation[] = [];
			// Start with B to guarantee a different order, then randomly weave both
			// queues while preserving the order of each device's local writes.
			second.push(remaining[1]!.shift()!);
			while (remaining.some((queue) => queue.length)) {
				const available = remaining.filter((queue) => queue.length);
				second.push(available[random(available.length)]!.shift()!);
			}
			const results = [];
			for (const order of [first, second]) {
				const rows = await run(initial, order);
				const records = rows.filter((r) => r.entity !== 'conflict');
				const conflicts = rows.filter((r) => r.entity === 'conflict');
				for (const { record } of conflicts) {
					const touched = all.filter(
						(m) =>
							m.entity === record.entity &&
							m.record_id === record.record_id &&
							Object.hasOwn(m.fields!, String(record.field)),
					);
					expect(new Set(touched.map((m) => m.device_id)).size, `seed ${seed}`).toBe(2);
					expect(new Set(touched.map((m) => m.device_id))).toEqual(
						new Set([record.kept_device, record.other_device]),
					);
					expect(
						touched.some((m) =>
							[record.kept_value, record.other_value].includes(m.fields![String(record.field)]!.to),
						),
					).toBe(true);
				}
				for (const [index, mutation] of order.entries()) {
					const to = mutation.fields!.note!.to;
					const final = records.find(
						(r) => r.entity === mutation.entity && r.record.id === mutation.record_id,
					)!;
					const preserved =
						final.record.note === to ||
						conflicts.some(
							({ record }) =>
								record.record_id === mutation.record_id &&
								record.field === 'note' &&
								[record.kept_value, record.other_value].includes(to),
						);
					const superseded = order
						.slice(index + 1)
						.some(
							(m) =>
								m.device_id === mutation.device_id &&
								m.record_id === mutation.record_id &&
								Object.hasOwn(m.fields!, 'note'),
						);
					expect(preserved || superseded, `seed ${seed}, mutation ${mutation.id}`).toBe(true);
				}
				results.push(
					records
						.map(({ entity, record }) => ({ entity, record: domain(record) }))
						.sort((a, b) => String(a.record.id).localeCompare(String(b.record.id))),
				);
			}
			expect(results[0], `seed ${seed}`).toEqual(results[1]);
		}
	}, 60_000);
});
