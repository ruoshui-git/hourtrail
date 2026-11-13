import { describe, expect, it } from 'vitest';
import {
	DEFAULT_ACTIVITY_TYPES,
	OVERHEAD_TYPE_ID,
	VOLUNTEER_TYPE_ID,
	WORK_TYPE_ID,
} from '../schema';
import { reportConfigSchema } from './config';
import { formatHours, headingLabel } from './format';
import { report } from './report';
import {
	CUSTOM_TYPE_ID,
	NOW,
	PLACE_A,
	PROJECT_A,
	WORK_ITEM_A,
	WORK_ITEM_B,
	at,
	configFor,
	customType,
	id,
	place,
	project,
	reportData,
	session,
	workItem,
} from './fixtures';

const DAY = { from: '2026-01-05', to: '2026-01-05' };
const UNICODE_NOTE = '修复洗手台 🚀\n第1寺院';

describe('work hours follow the type id, never the name', () => {
	it('counts Work and custom work types, and keeps Overhead out even when renamed Work', () => {
		const types = DEFAULT_ACTIVITY_TYPES.map((t) => {
			if (t.id === WORK_TYPE_ID) return { ...t, name: 'Deep focus' };
			if (t.id === OVERHEAD_TYPE_ID) return { ...t, name: 'Work' };
			return t;
		});
		const data = reportData({
			types: [...types, customType],
			sessions: [
				session({
					id: id(1),
					type_id: WORK_TYPE_ID,
					start_at: at('2026-01-05T10:00Z'),
					end_at: at('2026-01-05T11:00Z'),
				}),
				session({
					id: id(2),
					type_id: OVERHEAD_TYPE_ID,
					start_at: at('2026-01-05T11:00Z'),
					end_at: at('2026-01-05T11:30Z'),
				}),
				session({
					id: id(3),
					type_id: CUSTOM_TYPE_ID,
					start_at: at('2026-01-05T12:00Z'),
					end_at: at('2026-01-05T12:45Z'),
				}),
				session({
					id: id(4),
					type_id: VOLUNTEER_TYPE_ID,
					start_at: at('2026-01-05T13:00Z'),
					end_at: at('2026-01-05T14:00Z'),
				}),
			],
		});
		const result = report(configFor(DAY, { group_by: 'type' }), data, { now: NOW });
		expect(result.total_minutes).toBe(195);
		expect(result.work_minutes).toBe(105);
		expect(result.other_minutes).toEqual([
			{ type_id: VOLUNTEER_TYPE_ID, name: 'Volunteer', minutes: 60 },
			{ type_id: OVERHEAD_TYPE_ID, name: 'Work', minutes: 30 },
		]);
		expect(result.work_minutes + result.other_minutes.reduce((n, o) => n + o.minutes, 0)).toBe(195);
	});
});

describe('record visibility', () => {
	it('never counts tombstoned sessions but keeps tombstoned labels on live sessions', () => {
		const data = reportData({
			work_items: [
				workItem({
					id: WORK_ITEM_A,
					name: '库存管理系统开发',
					project_id: PROJECT_A,
					deleted_at: 9,
				}),
			],
			projects: [project({ id: PROJECT_A, name: '第1寺院', deleted_at: 9 })],
			places: [place({ id: PLACE_A, name: '修复洗手台', deleted_at: 9 })],
			sessions: [
				session({
					id: id(1),
					start_at: at('2026-01-05T10:00Z'),
					end_at: at('2026-01-05T10:30Z'),
					note: UNICODE_NOTE,
					place_id: PLACE_A,
				}),
				session({
					id: id(2),
					start_at: at('2026-01-05T11:00Z'),
					end_at: at('2026-01-05T12:00Z'),
					deleted_at: 7,
				}),
			],
		});
		const result = report(configFor(DAY, { group_by: 'project' }), data, { now: NOW });
		expect(result.total_minutes).toBe(30);
		expect(result.groups).toHaveLength(1);
		expect(result.groups[0]).toMatchObject({ label: '第1寺院', minutes: 30 });
		expect(result.rows[0]).toMatchObject({
			work_item_name: '库存管理系统开发',
			project_name: '第1寺院',
			place_name: '修复洗手台',
			note: UNICODE_NOTE,
		});
	});

	it('excludes running sessions unless includeRunning counts them up to now', () => {
		const data = reportData({
			sessions: [session({ id: id(1), start_at: at('2026-01-31T10:00Z'), end_at: null })],
		});
		const day = { from: '2026-01-31', to: '2026-01-31' };
		expect(report(configFor(day), data, { now: NOW }).total_minutes).toBe(0);
		const running = report(configFor(day), data, { now: NOW, includeRunning: true });
		expect(running.total_minutes).toBe(120);
		expect(running.rows[0]).toMatchObject({ minutes: 120, end_at: NOW });
	});
});

describe('ranges and time zones', () => {
	it('contributes only the in-range slice of a session crossing the range boundary', () => {
		const data = reportData({
			sessions: [
				session({ id: id(1), start_at: at('2026-01-01T22:00Z'), end_at: at('2026-01-02T02:00Z') }),
			],
		});
		const second = report(configFor({ from: '2026-01-02', to: '2026-01-02' }), data, { now: NOW });
		expect(second.total_minutes).toBe(120);
		expect(second.rows).toMatchObject([
			{
				day: '2026-01-02',
				start_local: '2026-01-02T00:00',
				end_local: '2026-01-02T02:00',
				minutes: 120,
			},
		]);
		expect(second.days).toHaveLength(1);
		const first = report(configFor({ from: '2026-01-01', to: '2026-01-01' }), data, { now: NOW });
		expect(first.total_minutes).toBe(120);
	});

	it('splits a New York midnight crossing into slices that sum to the session', () => {
		const data = reportData({
			settings: { reporting_tz: 'America/New_York' },
			sessions: [
				session({ id: id(1), start_at: at('2026-03-08T04:00Z'), end_at: at('2026-03-08T06:30Z') }),
			],
		});
		const result = report(configFor({ from: '2026-03-07', to: '2026-03-08' }), data, { now: NOW });
		expect(result.rows.map((r) => [r.day, r.minutes])).toEqual([
			['2026-03-07', 60],
			['2026-03-08', 90],
		]);
		expect(result.days.map((d) => d.minutes)).toEqual([60, 90]);
		expect(result.total_minutes).toBe(150);
	});

	it('counts a half-hour-offset midnight crossing in Asia/Kolkata', () => {
		const data = reportData({
			settings: { reporting_tz: 'Asia/Kolkata' },
			sessions: [
				session({ id: id(1), start_at: at('2026-01-01T18:15Z'), end_at: at('2026-01-01T19:20Z') }),
			],
		});
		const result = report(configFor({ from: '2026-01-01', to: '2026-01-02' }), data, { now: NOW });
		expect(result.rows).toMatchObject([
			{
				day: '2026-01-01',
				start_local: '2026-01-01T23:45',
				end_local: '2026-01-02T00:00',
				minutes: 15,
			},
			{
				day: '2026-01-02',
				start_local: '2026-01-02T00:00',
				end_local: '2026-01-02T00:50',
				minutes: 50,
			},
		]);
		expect(result.total_minutes).toBe(65);
	});

	it('counts a New York spring-forward day by elapsed time', () => {
		const data = reportData({
			settings: { reporting_tz: 'America/New_York' },
			sessions: [
				session({ id: id(1), start_at: at('2026-03-08T05:30Z'), end_at: at('2026-03-08T08:30Z') }),
			],
		});
		const result = report(configFor({ from: '2026-03-08', to: '2026-03-08' }), data, { now: NOW });
		expect(result.total_minutes).toBe(180);
		expect(result.days).toEqual([
			{
				day: '2026-03-08',
				minutes: 180,
				work_minutes: 180,
				by_type: [{ type_id: WORK_TYPE_ID, minutes: 180 }],
			},
		]);
	});

	it('fails loudly without a reporting zone rather than guessing one', () => {
		const data = reportData({ settings: {} });
		expect(() => report(configFor(DAY), data, { now: NOW })).toThrow(RangeError);
	});
});

describe('filters, notes and sessions', () => {
	const data = reportData({
		sessions: [
			session({
				id: id(1),
				start_at: at('2026-01-05T10:00Z'),
				end_at: at('2026-01-05T11:00Z'),
				note: 'alpha',
			}),
			session({
				id: id(2),
				type_id: OVERHEAD_TYPE_ID,
				work_item_id: WORK_ITEM_B,
				start_at: at('2026-01-05T11:00Z'),
				end_at: at('2026-01-05T11:30Z'),
				note: 'beta',
			}),
			session({
				id: id(3),
				start_at: at('2026-01-05T12:00Z'),
				end_at: at('2026-01-05T12:15Z'),
				note: 'gamma',
			}),
		],
	});

	it('applies type_ids and excluded_session_ids', () => {
		const byType = report(configFor(DAY, { type_ids: [WORK_TYPE_ID] }), data, { now: NOW });
		expect(byType.rows.map((r) => r.session_id)).toEqual([id(1), id(3)]);
		const excluded = report(configFor(DAY, { excluded_session_ids: [id(1)] }), data, { now: NOW });
		expect(excluded.total_minutes).toBe(45);
		expect(excluded.work_minutes).toBe(15);
	});

	it('removes notes with show_notes false and hides group rows with show_sessions false', () => {
		const result = report(configFor(DAY, { show_notes: false, show_sessions: false }), data, {
			now: NOW,
		});
		expect(result.rows.every((r) => r.note === null)).toBe(true);
		expect(result.groups.every((g) => g.rows === null)).toBe(true);
		const withNotes = report(configFor(DAY), data, { now: NOW });
		expect(withNotes.rows.map((r) => r.note)).toEqual(['alpha', 'beta', 'gamma']);
		expect(withNotes.groups.find((g) => g.rows?.length === 2)?.minutes).toBe(75);
	});

	it('groups by work item with Untitled and by day with zero-free day groups', () => {
		const untitled = session({
			id: id(4),
			work_item_id: null,
			start_at: at('2026-01-05T13:00Z'),
			end_at: at('2026-01-05T13:20Z'),
		});
		const withUntitled = reportData({ sessions: [...data.sessions, untitled] });
		const byItem = report(configFor(DAY, { group_by: 'work_item' }), withUntitled, { now: NOW });
		expect(byItem.groups.map((g) => [g.label, g.minutes])).toEqual([
			['库存管理系统开发', 75],
			['Beta', 30],
			['Untitled', 20],
		]);
		const byDay = report(configFor({ from: '2026-01-04', to: '2026-01-05' }), withUntitled, {
			now: NOW,
			includeRunning: false,
		});
		expect(byDay.days.map((d) => d.minutes)).toEqual([0, 125]);
		const grouped = report(
			configFor({ from: '2026-01-04', to: '2026-01-05' }, { group_by: 'day' }),
			withUntitled,
			{ now: NOW },
		);
		expect(grouped.groups.map((g) => [g.key, g.minutes])).toEqual([['2026-01-05', 125]]);
	});

	it('labels sessions without a project as No project', () => {
		const result = report(configFor(DAY, { group_by: 'project' }), data, { now: NOW });
		expect(result.groups.map((g) => [g.label, g.minutes])).toEqual([
			['第1寺院', 75],
			['No project', 30],
		]);
	});
});

describe('labels, headings and formatting', () => {
	it('uses custom headings in any language and English defaults otherwise', () => {
		const cfg = configFor(DAY, { headings: { work_hours: '工作时间', total: '' } });
		expect(headingLabel('work_hours', cfg)).toBe('工作时间');
		expect(headingLabel('total', cfg)).toBe('Total');
		expect(headingLabel('counts_as_work', cfg)).toBe('Counts as work');
	});

	it('formats hours in both formats and rejects fractional or negative minutes', () => {
		expect(formatHours(134, 'hm')).toBe('2h 14m');
		expect(formatHours(14, 'hm')).toBe('14m');
		expect(formatHours(0, 'hm')).toBe('0m');
		expect(formatHours(134, 'decimal')).toBe('2.23');
		expect(formatHours(120, 'decimal')).toBe('2.00');
		expect(() => formatHours(1.5, 'hm')).toThrow(RangeError);
		expect(() => formatHours(-1, 'decimal')).toThrow(RangeError);
	});

	it('passes names, notes and headings through byte-identical', () => {
		const name = '库存管理系统开发 第1寺院 修复洗手台 🚀✅';
		const data = reportData({
			work_items: [workItem({ id: WORK_ITEM_A, name, description: 'x' })],
			sessions: [
				session({
					id: id(1),
					start_at: at('2026-01-05T10:00Z'),
					end_at: at('2026-01-05T10:10Z'),
					note: UNICODE_NOTE,
				}),
			],
		});
		const result = report(configFor(DAY, { title: '报告 🚀' }), data, { now: NOW });
		expect(result.title).toBe('报告 🚀');
		expect(result.groups[0]?.label).toBe(name);
		expect(result.rows[0]?.note).toBe(UNICODE_NOTE);
	});
});

describe('config schema', () => {
	it('applies defaults and rejects unknown keys and inverted ranges', () => {
		const parsed = reportConfigSchema.parse({ range: { from: '2026-01-01', to: '2026-01-02' } });
		expect(parsed).toEqual({
			title: 'Work report',
			range: { from: '2026-01-01', to: '2026-01-02' },
			relative_range: null,
			type_ids: null,
			group_by: 'work_item',
			show_sessions: true,
			show_notes: true,
			excluded_session_ids: [],
			headings: {},
			hours_format: 'hm',
		});
		expect(() =>
			reportConfigSchema.parse({ range: { from: '2026-02-01', to: '2026-01-01' } }),
		).toThrow();
		expect(() => reportConfigSchema.parse({ range: DAY, surprise: true })).toThrow();
		expect(() => reportConfigSchema.parse({ range: DAY, headings: { nope: 'x' } })).toThrow();
	});
});
