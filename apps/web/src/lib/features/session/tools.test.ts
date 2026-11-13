import { describe, expect, it, vi } from 'vitest';
import type { RecordOf, SessionPlan } from '@hourtrail/core';
import type { Repo, UndoToken } from '$lib/db/repo';
import { applySessionPlan, findAdjacentCompatibleSession } from './tools';

function session(id: string, start_at: number, end_at: number | null, extra = {}) {
	return {
		id,
		rev: 0,
		created_at: 0,
		updated_at: 0,
		updated_by: 'device',
		deleted_at: null,
		work_item_id: 'item',
		type_id: 'type',
		start_at,
		start_tz: 'UTC',
		end_at,
		end_tz: end_at === null ? null : 'UTC',
		note: '',
		source: 'manual',
		place_id: null,
		place_state: 'none',
		place_candidates: [],
		flags: {},
		origin_device_id: 'device',
		...extra,
	} as RecordOf<'session'>;
}

describe('session tools', () => {
	it('finds only the immediate compatible, non-deleted neighbor', () => {
		const current = session('current', 100, 200);
		const previous = session('previous', 0, 90);
		const deleted = session('deleted', 20, 30, { deleted_at: 1 });
		expect(findAdjacentCompatibleSession([current, previous, deleted], current)?.id).toBe(
			'previous',
		);
		const intervening = session('intervening', 50, 80, { work_item_id: 'other' });
		expect(findAdjacentCompatibleSession([previous, intervening, current], current)).toBeNull();
		expect(
			findAdjacentCompatibleSession(
				[current, session('next', 201, 250, { type_id: 'other-type' })],
				current,
			),
		).toBeNull();
	});

	it('delegates the full plan to atomic repository application and returns its undo token', async () => {
		const plan: SessionPlan = { create: [], update: [], remove: [] };
		const undo = { label: 'Split session', mutations: [], before: [] } as UndoToken;
		const applyPlan = vi.fn().mockResolvedValue(undo);
		await expect(
			applySessionPlan({ applyPlan } as Pick<Repo, 'applyPlan'>, 'Split session', plan),
		).resolves.toBe(undo);
		expect(applyPlan).toHaveBeenCalledWith('Split session', 'session', plan);
	});
});
