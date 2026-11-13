import { describe, expect, it } from 'vitest';
import { OVERHEAD_TYPE_ID, WORK_TYPE_ID } from '../schema';
import { statistics } from './statistics';
import {
	CUSTOM_TYPE_ID,
	NOW,
	PLACE_A,
	WORK_ITEM_B,
	at,
	id,
	place,
	reportData,
	session,
} from './fixtures';

const weekStartSetting = (week_start: 1 | 7) => ({ reporting_tz: 'UTC', week_start });

describe('statistics ranges', () => {
	const data = reportData({ settings: weekStartSetting(7) });

	it('follows week_start for week boundaries', () => {
		expect(statistics({ kind: 'week', day: '2026-01-07' }, data, { now: NOW }).range).toEqual({
			from: '2026-01-04',
			to: '2026-01-10',
		});
		const monday = reportData({ settings: weekStartSetting(1) });
		expect(statistics({ kind: 'week', day: '2026-01-07' }, monday, { now: NOW }).range).toEqual({
			from: '2026-01-05',
			to: '2026-01-11',
		});
	});

	it('uses calendar month bounds, including leap-year February', () => {
		expect(statistics({ kind: 'month', day: '2026-02-14' }, data, { now: NOW }).range).toEqual({
			from: '2026-02-01',
			to: '2026-02-28',
		});
		expect(statistics({ kind: 'month', day: '2024-02-10' }, data, { now: NOW }).range).toEqual({
			from: '2024-02-01',
			to: '2024-02-29',
		});
	});

	it('rejects an inverted custom range', () => {
		expect(() =>
			statistics({ kind: 'custom', from: '2026-02-02', to: '2026-02-01' }, data, { now: NOW }),
		).toThrow(RangeError);
	});

	it('switches from daily to weekly bars beyond eight weeks, keeping totals exact', () => {
		const sessions = Array.from({ length: 60 }, (_, i) => {
			const start = at('2026-01-01T09:00Z') + i * 86_400_000;
			return session({ id: id(i + 1), start_at: start, end_at: start + 30 * 60_000 });
		});
		const populated = reportData({ settings: weekStartSetting(1), sessions });
		const eight = statistics({ kind: 'custom', from: '2026-01-01', to: '2026-02-25' }, populated, {
			now: NOW,
		});
		expect(eight.bar_unit).toBe('day');
		expect(eight.bars).toHaveLength(56);

		const nine = statistics({ kind: 'custom', from: '2026-01-01', to: '2026-02-26' }, populated, {
			now: NOW,
		});
		expect(nine.bar_unit).toBe('week');
		expect(nine.bars).toHaveLength(9);
		expect(nine.bars[0]).toMatchObject({ from: '2026-01-01', to: '2026-01-04' });
		expect(nine.bars.at(-1)).toMatchObject({ from: '2026-02-23', to: '2026-02-26' });
		const barTotal = nine.bars.reduce((n, b) => n + b.minutes, 0);
		expect(barTotal).toBe(nine.total_minutes);
		expect(nine.total_minutes).toBe(57 * 30);
	});
});

describe('statistics content', () => {
	const data = reportData({
		settings: weekStartSetting(1),
		places: [place({ id: PLACE_A, name: '修复洗手台 🚀' })],
		sessions: [
			session({
				id: id(1),
				start_at: at('2026-01-05T10:00Z'),
				end_at: at('2026-01-05T11:00Z'),
				place_id: PLACE_A,
			}),
			session({
				id: id(2),
				type_id: OVERHEAD_TYPE_ID,
				work_item_id: WORK_ITEM_B,
				start_at: at('2026-01-05T11:00Z'),
				end_at: at('2026-01-05T11:30Z'),
			}),
			session({
				id: id(3),
				type_id: CUSTOM_TYPE_ID,
				work_item_id: null,
				start_at: at('2026-01-05T12:00Z'),
				end_at: at('2026-01-05T12:15Z'),
			}),
			session({
				id: id(4),
				deleted_at: 3,
				start_at: at('2026-01-05T13:00Z'),
				end_at: at('2026-01-05T14:00Z'),
			}),
			session({ id: id(5), start_at: at('2026-01-31T10:00Z'), end_at: null }),
		],
	});
	const day = { kind: 'day' as const, day: '2026-01-05' };

	it('totals types, work items, projects and places with work hours by id', () => {
		const stats = statistics(day, data, { now: NOW });
		expect(stats.total_minutes).toBe(105);
		expect(stats.work_minutes).toBe(75);
		expect(stats.session_count).toBe(3);
		expect(stats.by_type).toEqual([
			{ type_id: WORK_TYPE_ID, name: 'Work', counts_as_work: true, minutes: 60 },
			{ type_id: OVERHEAD_TYPE_ID, name: 'Overhead', counts_as_work: false, minutes: 30 },
			{ type_id: CUSTOM_TYPE_ID, name: 'Custom', counts_as_work: true, minutes: 15 },
		]);
		expect(stats.by_work_item.map((b) => [b.label, b.minutes])).toEqual([
			['库存管理系统开发', 60],
			['Beta', 30],
			['Untitled', 15],
		]);
		expect(stats.by_project.map((b) => [b.label, b.minutes])).toEqual([
			['第1寺院', 60],
			['No project', 45],
		]);
		expect(stats.by_place.map((b) => [b.label, b.minutes])).toEqual([
			['修复洗手台 🚀', 60],
			['No place', 45],
		]);
	});

	it('counts running sessions only with includeRunning, up to now', () => {
		const without = statistics({ kind: 'day', day: '2026-01-31' }, data, { now: NOW });
		expect(without.total_minutes).toBe(0);
		const withRunning = statistics({ kind: 'day', day: '2026-01-31' }, data, {
			now: NOW,
			includeRunning: true,
		});
		expect(withRunning.total_minutes).toBe(120);
		expect(withRunning.recent[0]).toMatchObject({ session_id: id(5), minutes: 120 });
	});

	it('lists recent slices newest first, capped at ten', () => {
		const sessions = Array.from({ length: 12 }, (_, i) => {
			const start = at('2026-01-05T00:00Z') + i * 3_600_000;
			return session({ id: id(i + 1), start_at: start, end_at: start + 60_000 });
		});
		const stats = statistics(day, reportData({ settings: weekStartSetting(1), sessions }), {
			now: NOW,
		});
		expect(stats.recent).toHaveLength(10);
		expect(stats.recent[0]?.session_id).toBe(id(12));
		expect(stats.recent[9]?.session_id).toBe(id(3));
	});
});
