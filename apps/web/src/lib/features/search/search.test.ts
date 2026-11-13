import { describe, expect, it } from 'vitest';
import type { RecordOf } from '@hourtrail/core';
import { searchSessions, type SearchData } from './search';

const session = (
	id: string,
	start_at: number,
	note = '',
	type_id = 'work',
	extra: Partial<RecordOf<'session'>> = {},
) =>
	({
		id,
		rev: 1,
		created_at: start_at,
		updated_at: start_at,
		updated_by: 'test',
		deleted_at: null,
		work_item_id: 'item',
		type_id,
		start_at,
		start_tz: 'America/New_York',
		end_at: start_at + 3_600_000,
		end_tz: 'America/New_York',
		note,
		source: 'manual',
		place_id: null,
		...extra,
	}) as RecordOf<'session'>;

const data: SearchData = {
	sessions: [
		session('older', Date.parse('2026-11-01T05:30:00Z'), '修复洗手台', 'volunteer'),
		session('newer', Date.parse('2026-11-02T15:00:00Z'), 'planning'),
	],
	items: [
		{
			id: 'item',
			name: '库存管理系统开发',
			project_id: 'project',
			place_id: 'place',
			deleted_at: null,
		} as RecordOf<'work_item'>,
	],
	types: [
		{ id: 'work', name: 'Work', deleted_at: null } as RecordOf<'activity_type'>,
		{ id: 'volunteer', name: 'Volunteer', deleted_at: null } as RecordOf<'activity_type'>,
	],
	projects: [{ id: 'project', name: 'Migration', deleted_at: null } as RecordOf<'project'>],
	places: [{ id: 'place', name: '第1寺院', deleted_at: null } as RecordOf<'place'>],
};

describe('searchSessions', () => {
	const run = (filters: Parameters<typeof searchSessions>[1]) =>
		searchSessions(data, filters, 'America/New_York', Date.parse('2026-11-03T00:00:00Z'));
	it('matches Unicode item, note, project, place, and sorts newest first', () => {
		expect(run({ query: '库存' }).sessions.map(({ id }) => id)).toEqual(['newer', 'older']);
		expect(run({ query: '修复洗手台' }).sessions).toHaveLength(1);
		expect(run({ query: 'migration' }).sessions).toHaveLength(2);
		expect(run({ query: '第1寺院' }).sessions).toHaveLength(2);
		expect(run({}).sessions.map(({ id }) => id)).toEqual(['newer', 'older']);
	});
	it('applies type, project, place, date, and combined filters', () => {
		expect(run({ types: ['volunteer'] }).sessions.map(({ id }) => id)).toEqual(['older']);
		expect(run({ project: 'project' }).sessions).toHaveLength(2);
		expect(run({ place: 'place' }).sessions).toHaveLength(2);
		expect(run({ from: '2026-11-01', to: '2026-11-01' }).sessions.map(({ id }) => id)).toEqual([
			'older',
		]);
		expect(
			run({
				query: '库存',
				types: ['work'],
				project: 'project',
				place: 'place',
				from: '2026-11-02',
				to: '2026-11-02',
			}).sessions.map(({ id }) => id),
		).toEqual(['newer']);
	});
	it('searches 5,000 sessions within 100 ms', () => {
		const large = {
			...data,
			sessions: Array.from({ length: 5000 }, (_, index) =>
				session(
					String(index),
					Date.parse('2026-11-01T05:30:00Z') + index,
					index === 4999 ? 'needle' : 'other',
				),
			),
		};
		// Best of three: the budget is for the search itself, not for JIT warm-up or for
		// scheduler noise when the machine is busy (a single sample failed under load).
		const timings = Array.from({ length: 3 }, () => {
			const start = performance.now();
			expect(
				searchSessions(large, { query: 'needle' }, 'America/New_York', Date.now()).sessions,
			).toHaveLength(1);
			return performance.now() - start;
		});
		expect(Math.min(...timings)).toBeLessThan(100);
	});

	it('bounds date ranges by calendar days in the zone across DST changes', () => {
		const dst: SearchData = {
			...data,
			sessions: [
				// 01:30 EDT on 2026-11-01, the fall-back day (25 hours).
				session('fallback', Date.parse('2026-11-01T05:30:00Z')),
				// 00:30 EDT on 2026-11-01 (just after midnight).
				session('just-after-midnight', Date.parse('2026-11-01T04:30:00Z')),
				// 23:59 EST on Nov 1 is 2026-11-02T04:59Z: still Nov 1 after the change.
				session('end-of-long-day', Date.parse('2026-11-02T04:59:00Z')),
				// 03:30 EDT on 2026-03-08, the spring-forward day (23 hours).
				session('spring', Date.parse('2026-03-08T07:30:00Z')),
			],
		};
		const range = (from: string, to: string) =>
			searchSessions(dst, { from, to }, 'America/New_York', Date.parse('2026-11-03T00:00:00Z'))
				.sessions.map(({ id }) => id)
				.sort();
		expect(range('2026-11-01', '2026-11-01')).toEqual([
			'end-of-long-day',
			'fallback',
			'just-after-midnight',
		]);
		expect(range('2026-10-31', '2026-10-31')).toEqual([]);
		expect(range('2026-03-08', '2026-03-08')).toEqual(['spring']);
		expect(range('2026-03-07', '2026-03-07')).toEqual([]);
	});
});
