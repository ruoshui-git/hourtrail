import { applyMutation, batchSchema, WORK_TYPE_ID } from '@hourtrail/core';
import type { Batch } from '@hourtrail/core';

/**
 * Zod builds a schema's validator on first use, so the first push in a fresh isolate paid
 * that cost inside the request: 15 ms CPU on staging versus 2–7 ms afterwards (2026-11-13),
 * over the free plan's 10 ms. Running one tiny session put and patch at module load moves
 * that work into isolate startup, which has its own, much larger limit.
 */
const id = '00000000-0000-7000-8000-0000000000f1';
const device = 'warmup';
const session = {
	id,
	rev: 0,
	created_at: 0,
	updated_at: 0,
	updated_by: device,
	deleted_at: null,
	work_item_id: null,
	type_id: WORK_TYPE_ID,
	start_at: 0,
	end_at: 60_000,
	start_tz: 'UTC',
	end_tz: 'UTC',
	note: '库存管理系统开发',
	source: 'live',
	place_id: null,
	place_state: 'none',
	place_candidates: [],
	origin_device_id: device,
	flags: {},
};

export const warmupBatch = {
	batch_id: '00000000-0000-7000-8000-0000000000f2',
	device_id: device,
	mutations: [
		{
			id: '00000000-0000-7000-8000-0000000000f3',
			entity: 'session',
			record_id: id,
			kind: 'put',
			value: session,
			at: 1,
			device_id: device,
		},
		{
			id: '00000000-0000-7000-8000-0000000000f4',
			entity: 'session',
			record_id: id,
			kind: 'patch',
			fields: { note: { from: '库存管理系统开发', to: '第1寺院' } },
			at: 2,
			device_id: device,
		},
	],
};

/** Returns whether the warm-up ran end to end; never throws (it runs at module load). */
export function warmPushPath(): boolean {
	try {
		const parsed: Batch = batchSchema.parse(JSON.parse(JSON.stringify(warmupBatch)));
		let current = null;
		for (const mutation of parsed.mutations) {
			current = applyMutation(current, mutation, { now: 10, rev: 1, validated: true }).next;
		}
		JSON.stringify(current);
		return true;
	} catch {
		return false;
	}
}
