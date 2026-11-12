import { z } from 'zod';
import { zoneSchema } from './common';

export const settingSchemas = {
	reporting_tz: zoneSchema.nullable(),
	week_start: z.union([
		z.literal(1),
		z.literal(2),
		z.literal(3),
		z.literal(4),
		z.literal(5),
		z.literal(6),
		z.literal(7),
	]),
	reminder: z.object({
		enabled: z.boolean(),
		threshold_min: z.number(),
		repeat_min: z.number().nullable(),
	}),
	sync_raw_gps: z.boolean(),
	long_gap_min: z.number(),
	long_session_min: z.number(),
	note_prompt: z.enum(['work', 'all', 'none']),
	duration_format: z.enum(['hm', 'decimal']),
};

export type SettingKey = keyof typeof settingSchemas;
export type SettingValues = { [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> };

export const SETTING_DEFAULTS: SettingValues = {
	reporting_tz: null,
	week_start: 1,
	reminder: { enabled: false, threshold_min: 240, repeat_min: null },
	sync_raw_gps: false,
	long_gap_min: 60,
	long_session_min: 600,
	note_prompt: 'work',
	duration_format: 'hm',
};

export function readSetting<K extends SettingKey>(key: K, stored: unknown): SettingValues[K] {
	const schema = settingSchemas[key];
	const result = schema.safeParse(stored);
	// Parsing also copies object defaults, so callers cannot mutate the shared reminder default.
	return (result.success ? result.data : schema.parse(SETTING_DEFAULTS[key])) as SettingValues[K];
}
