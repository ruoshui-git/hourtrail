import { z } from 'zod';
import { daySchema, uuidSchema } from '../schema';

export const HEADING_KEYS = [
	'date',
	'start',
	'end',
	'duration',
	'hours',
	'type',
	'counts_as_work',
	'project',
	'work_item',
	'note',
	'place',
	'work_hours',
	'other_hours',
	'total',
] as const;

export type HeadingKey = (typeof HEADING_KEYS)[number];

/** Ranges that follow the calendar when the config is loaded (see resolveRange). */
export const RELATIVE_RANGES = ['this_month', 'last_month', 'this_week'] as const;
export type RelativeRange = (typeof RELATIVE_RANGES)[number];

/** Saved as `report_preset.config`; strict so unknown keys cannot hide in stored presets. */
export const reportConfigSchema = z.strictObject({
	title: z.string().default('Work report'),
	range: z
		.strictObject({ from: daySchema, to: daySchema })
		.refine((range) => range.from <= range.to, {
			message: 'The range must start on or before it ends',
			path: ['to'],
		}),
	/** When set, the period is resolved from today when loaded and `range` is ignored. */
	relative_range: z.enum(RELATIVE_RANGES).nullable().default(null),
	type_ids: z.array(uuidSchema).nullable().default(null),
	group_by: z.enum(['work_item', 'project', 'day', 'type']).default('work_item'),
	show_sessions: z.boolean().default(true),
	show_notes: z.boolean().default(true),
	excluded_session_ids: z.array(uuidSchema).default([]),
	headings: z.partialRecord(z.enum(HEADING_KEYS), z.string()).default({}),
	hours_format: z.enum(['hm', 'decimal']).default('hm'),
});

export type ReportConfig = z.output<typeof reportConfigSchema>;
