import { z } from 'zod';
import { isUuid } from '../ids';
import { isValidDay, isValidZone } from '../time';

export const uuidSchema = z.string().refine(isUuid, 'Expected a lowercase hyphenated UUID');
export const epochSchema = z.int();
export const daySchema = z.string().refine(isValidDay, 'Expected a YYYY-MM-DD calendar day');
export const zoneSchema = z.string().refine(isValidZone, 'Expected an IANA time zone');
export const commonFields = {
	id: uuidSchema,
	rev: z.int().nonnegative(),
	created_at: epochSchema,
	updated_at: epochSchema,
	updated_by: z.string(),
	deleted_at: epochSchema.nullable(),
};

export const ENTITIES = [
	'activity_type',
	'project',
	'work_item',
	'session',
	'place',
	'session_fix',
	'review_mark',
	'day_review',
	'setting',
	'report_preset',
	'conflict',
] as const;
export type Entity = (typeof ENTITIES)[number];
