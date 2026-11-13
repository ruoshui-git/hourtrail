import {
	applyMutation,
	batchSchema,
	patchMutation,
	putMutation,
	type AnyRecord,
	type Batch,
	type Mutation,
	type Session,
} from '@hourtrail/core';
import { describe, expect, it } from 'vitest';
import { batch, deviceA, now, session } from './sync-helpers';

// Pure push work as the route does it after authentication: parse the body,
// apply each mutation over the records read from D1, and serialize the writes
// and the ack. D1 latency is excluded; these numbers guard CPU time only.
const WARM_RUNS = 15;
const BURST = 10;

type Scenario = { body: string; seed: Map<string, AnyRecord> };

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)]!;
}

function pushWork({ body, seed }: Scenario): number {
	const parsed = batchSchema.safeParse(JSON.parse(body));
	if (!parsed.success) throw new Error('benchmark batch must be valid');
	const current = new Map(seed);
	const writes: string[] = [];
	for (const mutation of parsed.data.mutations) {
		const key = `${mutation.entity}:${mutation.record_id}`;
		const result = applyMutation(current.get(key) ?? null, mutation, {
			now,
			rev: 2,
			mode: parsed.data.mode,
			validated: true,
		});
		if (result.changed && result.next) {
			current.set(key, result.next);
			writes.push(JSON.stringify(result.next));
		}
		for (const conflict of result.conflicts) writes.push(JSON.stringify(conflict));
	}
	return JSON.stringify({ applied: writes.length, rejected: [], seq: 2 }).length + writes.length;
}

function timeScenario(scenario: Scenario): { first: number; warm: number } {
	const start = performance.now();
	pushWork(scenario);
	const first = performance.now() - start;
	// workerd's clock is coarse, so each sample averages a burst of calls.
	const samples: number[] = [];
	for (let i = 0; i < WARM_RUNS; i++) {
		const t0 = performance.now();
		for (let j = 0; j < BURST; j++) pushWork(scenario);
		samples.push((performance.now() - t0) / BURST);
	}
	return { first, warm: median(samples) };
}

function sessionsBatch(count: number): { input: Batch; seed: Map<string, AnyRecord> } {
	const records = Array.from({ length: count }, (_, i) =>
		session(`库存管理系统开发 ${i} 第1寺院 修复洗手台`),
	);
	const input = batch(
		records.map((record) => putMutation('session', record as Session, { now, deviceId: deviceA })),
	);
	return { input, seed: new Map() };
}

function patchBatch(count: number): { input: Batch; seed: Map<string, AnyRecord> } {
	const records = Array.from({ length: count }, (_, i) => session(`original ${i}`));
	const seed = new Map<string, AnyRecord>(
		records.map((record) => [`session:${record.id}`, record as AnyRecord]),
	);
	const mutations: Mutation[] = [];
	for (const record of records) {
		const change = patchMutation(
			'session',
			record as Session,
			{ note: `修复洗手台 ${record.id.slice(-4)}` },
			{ now: now + 100, deviceId: deviceA },
		);
		if (change) mutations.push(change);
	}
	return { input: batch(mutations), seed };
}

describe('push CPU benchmark (workerd)', () => {
	it('times a 50-session put batch and a 50-patch batch', () => {
		const puts = sessionsBatch(50);
		const patches = patchBatch(50);
		expect(puts.input.mutations).toHaveLength(50);
		expect(patches.input.mutations).toHaveLength(50);

		const results = {
			put50: timeScenario({ body: JSON.stringify(puts.input), seed: puts.seed }),
			patch50: timeScenario({ body: JSON.stringify(patches.input), seed: patches.seed }),
		};
		console.log(
			`push CPU (ms, workerd, validated path): ` +
				`put50 first ${results.put50.first.toFixed(2)} warm(median of ${WARM_RUNS}) ${results.put50.warm.toFixed(2)}; ` +
				`patch50 first ${results.patch50.first.toFixed(2)} warm(median of ${WARM_RUNS}) ${results.patch50.warm.toFixed(2)}`,
		);
		// Loose guard only: CI machines vary, so this is far above the 6 ms target.
		expect(results.put50.warm).toBeLessThan(20);
	});
});
