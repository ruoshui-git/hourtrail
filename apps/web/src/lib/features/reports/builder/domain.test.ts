import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIVITY_TYPES, WORK_TYPE_ID, reportConfigSchema } from '@hourtrail/core';
import type { ReportData, Session } from '@hourtrail/core';
import { defaultForm, formConfig, formFromConfig, previewOf, readPreset } from './domain';

const id = (n: number) => `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
const common = { rev: 1, created_at: 0, updated_at: 0, updated_by: 'd', deleted_at: null };

function session(n: number, start: string, end: string, note: string): Session {
	return {
		...common,
		id: id(n),
		work_item_id: id(0x20),
		type_id: WORK_TYPE_ID,
		start_at: Date.parse(start),
		end_at: Date.parse(end),
		start_tz: 'UTC',
		end_tz: 'UTC',
		note,
		source: 'live',
		place_id: null,
		place_state: 'none',
		place_candidates: [],
		origin_device_id: 'd',
		flags: {},
	};
}

const data: ReportData = {
	sessions: [
		session(1, '2026-11-02T09:00Z', '2026-11-02T10:00Z', 'first'),
		session(2, '2026-11-03T09:00Z', '2026-11-03T10:30Z', 'second'),
	],
	work_items: [
		{
			...common,
			id: id(0x20),
			name: '库存管理系统开发',
			description: '',
			type_id: WORK_TYPE_ID,
			project_id: null,
			place_id: null,
			pinned_at: null,
			pin_sort: 0,
			archived_at: null,
		},
	],
	projects: [],
	types: DEFAULT_ACTIVITY_TYPES,
	places: [],
	settings: { reporting_tz: 'UTC', week_start: 1 },
};

describe('formConfig', () => {
	it('resolves a relative choice against today and stores the period it covers', () => {
		const result = formConfig(defaultForm(), '2026-11-12', 1);
		if (!('config' in result)) throw new Error(result.problem);
		expect(result.config.relative_range).toBe('this_month');
		expect(result.config.range).toEqual({ from: '2026-11-01', to: '2026-11-30' });
	});

	it('reports a custom range that ends before it starts', () => {
		const form = { ...defaultForm(), rangeChoice: 'custom' as const };
		form.customFrom = '2026-11-12';
		form.customTo = '2026-11-01';
		expect(formConfig(form, '2026-11-12', 1)).toEqual({
			problem: 'The first date must be on or before the last date.',
		});
	});

	it('drops empty custom headings so the English default shows', () => {
		const form = { ...defaultForm(), headings: { ...defaultForm().headings, work_item: '工作项' } };
		const result = formConfig(form, '2026-11-12', 1);
		if (!('config' in result)) throw new Error(result.problem);
		expect(result.config.headings).toEqual({ work_item: '工作项' });
	});
});

describe('formFromConfig and readPreset', () => {
	it('round-trips a relative preset back into the form', () => {
		const result = formConfig({ ...defaultForm(), rangeChoice: 'last_month' }, '2026-11-12', 1);
		if (!('config' in result)) throw new Error(result.problem);
		expect(formFromConfig(result.config).rangeChoice).toBe('last_month');
	});

	it('refuses a stored config that does not validate', () => {
		expect(readPreset({ range: { from: '2026-11-01', to: '2026-11-30' }, bogus: 1 })).toEqual({
			ok: false,
		});
		const valid = readPreset({ range: { from: '2026-11-01', to: '2026-11-30' } });
		expect(valid.ok).toBe(true);
	});
});

describe('previewOf', () => {
	const config = reportConfigSchema.parse({ range: { from: '2026-11-01', to: '2026-11-30' } });
	const NOW = Date.parse('2026-11-12T12:00Z');

	it('keeps excluded sessions visible but leaves them out of every total', () => {
		const { shown, groups } = previewOf({ ...config, excluded_session_ids: [id(2)] }, data, NOW);
		expect(shown.work_minutes).toBe(60);
		const rows = groups.flatMap((group) => group.rows ?? []);
		expect(rows.map((row) => [row.session_id, row.excluded])).toEqual([
			[id(1), false],
			[id(2), true],
		]);
		expect(groups[0]?.minutes).toBe(60);
	});
});
