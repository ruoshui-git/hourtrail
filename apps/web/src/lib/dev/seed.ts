import { DEFAULT_ACTIVITY_TYPES } from '@hourtrail/core';
import type { HourtrailDB } from '$lib/db/schema';
import type { Repo } from '$lib/db/repo';

/**
 * Deterministic sample data for screenshots and manual testing (dev only).
 * Times are relative to the page clock, which `pnpm shots` fixes at
 * 2026-11-12 10:30 America/New_York.
 */
export const SEED_SCENARIOS = ['empty', 'idle', 'running', 'untitled'] as const;
export type SeedScenario = (typeof SEED_SCENARIOS)[number];

const [WORK, OVERHEAD, VOLUNTEER] = DEFAULT_ACTIVITY_TYPES.map((t) => t.id) as [
	string,
	string,
	string,
	string,
];

export async function resetDatabase(db: HourtrailDB): Promise<void> {
	await db.transaction('rw', db.tables, async () => {
		await Promise.all(db.tables.map((table) => table.clear()));
	});
}

export async function seed(db: HourtrailDB, repo: Repo, scenario: SeedScenario): Promise<void> {
	await resetDatabase(db);
	await repo.ensureSeeded();
	if (scenario === 'empty') return;

	const now = Date.now();
	const minute = 60_000;
	const temple = await repo.create('project', { name: 'Temple', archived_at: null });
	const item = (name: string, type_id: string, extra: { pinned?: number; project?: string } = {}) =>
		repo.create('work_item', {
			name,
			description: '',
			type_id,
			project_id: extra.project ?? null,
			place_id: null,
			pinned_at: extra.pinned ?? null,
			pin_sort: extra.pinned ? 1 : 0,
			archived_at: null,
		});
	const inventory = await item('库存管理系统开发', WORK, {
		pinned: now - 30 * minute,
		project: temple.id,
	});
	const maintenance = await item('Building Maintenance', WORK, { project: temple.id });
	const sink = await item('修复洗手台', VOLUNTEER);
	const coordination = await item(
		'Quarterly volunteer coordination and event preparation',
		VOLUNTEER,
	);
	await item('Team meeting', OVERHEAD);

	const session = (
		work_item_id: string | null,
		type_id: string,
		startMin: number,
		endMin: number | null,
		note = '',
	) =>
		repo.create('session', {
			work_item_id,
			type_id,
			start_at: now - startMin * minute,
			end_at: endMin === null ? null : now - endMin * minute,
			start_tz: 'America/New_York',
			end_tz: endMin === null ? null : 'America/New_York',
			note,
			source: 'live',
			place_id: null,
			place_state: 'none',
			place_candidates: [],
			flags: {},
			origin_device_id: 'seed',
		});
	// Yesterday and earlier today, so Recent and the ribbon have content.
	await session(coordination.id, VOLUNTEER, 26 * 60, 24 * 60 + 30, 'Planned the 第1寺院 open day.');
	// Crosses midnight: yesterday 22:00 to today 01:30 (shows on both days).
	await session(sink.id, VOLUNTEER, 12 * 60 + 30, 9 * 60, '夜间检查 第1寺院.');
	await session(inventory.id, WORK, 6 * 60 + 28, 4 * 60, '权限开发 and import testing.');
	await session(maintenance.id, WORK, 3 * 60 + 50, 3 * 60 + 5);
	await session(sink.id, VOLUNTEER, 2 * 60 + 40, 2 * 60);

	if (scenario === 'running') await session(inventory.id, WORK, 75, null);
	if (scenario === 'untitled') await session(null, WORK, 20, null);
}
