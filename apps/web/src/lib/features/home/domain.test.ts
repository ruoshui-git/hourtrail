import { describe, expect, it } from 'vitest';
import { selectRecentItems, todayRibbonSegments, todayTotals } from './domain';

const type = (id: string, counts_as_work: boolean, color: 'blue' | 'gold') =>
	({ id, counts_as_work, color }) as never;
const session = (id: string, type_id: string, start_at: number, end_at: number | null) =>
	({ id, type_id, start_at, end_at, work_item_id: null }) as never;

describe('home day helpers', () => {
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
