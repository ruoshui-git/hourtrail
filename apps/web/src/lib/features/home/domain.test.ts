import { describe, expect, it } from 'vitest';
import {
	runningPairKey,
	runningResolutionChoices,
	selectRecentItems,
	todayRibbonSegments,
	todayTotals,
} from './domain';

const type = (id: string, counts_as_work: boolean, color: 'blue' | 'gold') =>
	({ id, counts_as_work, color }) as never;
const session = (id: string, type_id: string, start_at: number, end_at: number | null) =>
	({ id, type_id, start_at, end_at, work_item_id: null }) as never;

describe('home day helpers', () => {
	it('labels two-session resolutions with start times and ends the earlier item when the later began', () => {
		const earlier = {
			id: 'early',
			work_item_id: 'sink',
			start_at: 100,
			start_tz: 'UTC',
			rev: 1,
			updated_at: 10,
		} as never;
		const later = {
			id: 'late',
			work_item_id: 'inventory',
			start_at: 200,
			start_tz: 'America/Halifax',
			rev: 2,
			updated_at: 20,
		} as never;
		const choices = runningResolutionChoices(
			[later, earlier],
			new Map([
				['sink', '修复洗手台'],
				['inventory', '库存管理系统开发'],
			]),
			(ms) => `t${ms}`,
		);
		expect(choices.map(({ label }) => label)).toEqual([
			'Stop 修复洗手台 (from t100) at t200',
			'Stop 修复洗手台 (from t100) now',
			'Keep both',
		]);
		expect(choices[0]).toMatchObject({
			kind: 'stop-at-later-start',
			targetIds: ['early'],
			endAt: 200,
			endTz: 'America/Halifax',
		});
		expect(runningPairKey([earlier, later])).toBe(runningPairKey([later, earlier]));
	});

	it('offers one stop-all choice when more than two sessions run', () => {
		const sessions = [100, 200, 300].map(
			(start_at, index) =>
				({
					id: `session-${index}`,
					start_at,
					start_tz: 'UTC',
					work_item_id: `item-${index}`,
				}) as never,
		);
		expect(runningResolutionChoices(sessions, new Map()).map((choice) => choice.label)).toEqual([
			'Stop all but the latest',
		]);
		expect(runningResolutionChoices(sessions, new Map())[0]).toMatchObject({
			targetIds: ['session-0', 'session-1'],
			endAt: 300,
		});
	});

	it('allocates today minutes to work or other by type id', () => {
		const start = Date.parse('2026-11-12T04:00:00Z');
		expect(
			todayTotals(
				[
					session('a', 'work', start, start + 60 * 60_000),
					session('b', 'other', start, start + 30 * 60_000),
				],
				[type('work', true, 'blue'), type('other', false, 'gold')],
				'2026-11-12',
				'UTC',
				start + 60 * 60_000,
			),
		).toEqual({ work: 60, other: 30 });
	});

	it('returns ribbon spans clipped to today with each session type color', () => {
		const start = Date.parse('2026-11-12T23:30:00Z');
		const rows = todayRibbonSegments(
			[session('a', 'work', start, start + 60 * 60_000)],
			[],
			[type('work', true, 'blue')],
			'UTC',
			'2026-11-12',
			start + 60 * 60_000,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ id: 'a', start, end: start + 30 * 60_000, color: 'blue' });
	});

	it('selects the six distinct latest items and excludes pinned and archived items', () => {
		const items = Array.from({ length: 8 }, (_, index) => ({
			id: `item-${index}`,
			archived_at: index === 7 ? 1 : null,
			deleted_at: null,
		})) as never;
		const sessions = Array.from({ length: 7 }, (_, index) => ({
			id: `session-${index}`,
			type_id: 'work',
			start_at: index,
			end_at: null,
			deleted_at: null,
			work_item_id: `item-${index}`,
		})) as never;
		expect(selectRecentItems(items, sessions, new Set(['item-6'])).map((item) => item.id)).toEqual([
			'item-5',
			'item-4',
			'item-3',
			'item-2',
			'item-1',
			'item-0',
		]);
	});
});
