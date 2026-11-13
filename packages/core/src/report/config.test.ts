import { describe, expect, it } from 'vitest';
import { reportConfigSchema } from './config';

const range = { from: '2026-11-01', to: '2026-11-30' };

describe('reportConfigSchema', () => {
	it('fills in defaults for a minimal stored preset', () => {
		const parsed = reportConfigSchema.parse({ range });
		expect(parsed).toEqual({
			title: 'Work report',
			range,
			relative_range: null,
			type_ids: null,
			group_by: 'work_item',
			show_sessions: true,
			show_notes: true,
			excluded_session_ids: [],
			headings: {},
			hours_format: 'hm',
		});
	});

	it('keeps a relative preset as saved', () => {
		expect(reportConfigSchema.parse({ range, relative_range: 'last_month' }).relative_range).toBe(
			'last_month',
		);
	});

	it('refuses a range that ends before it starts', () => {
		expect(() =>
			reportConfigSchema.parse({ range: { from: '2026-11-02', to: '2026-11-01' } }),
		).toThrow();
	});
});
