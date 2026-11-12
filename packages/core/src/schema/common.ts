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

export type JsonValue =
	null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Plain JSON data: finite numbers, arrays and plain objects, at most 64 levels deep. */
export function isJsonValue(value: unknown, depth = 0): value is JsonValue {
	if (depth > 64) return false;
	if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
	if (typeof value === 'number') return Number.isFinite(value);
	if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1));
	if (typeof value !== 'object') return false;
	const proto = Object.getPrototypeOf(value);
	if (proto !== Object.prototype && proto !== null) return false;
	// Own keys only; an own "__proto__" key is ordinary data here.
	return Object.keys(value).every((key) =>
		isJsonValue((value as Record<string, unknown>)[key], depth + 1),
	);
}

/**
 * JSON field schema that validates in place and returns the value unchanged.
 * Zod's z.json() rebuilds objects and silently drops an own "__proto__" key,
 * which altered user data and made such records fail the merge's unknown-field
 * check; never use z.json() for stored data.
 */
export const jsonValueSchema = z.custom<JsonValue>((value) => isJsonValue(value), {
	message: 'Expected a JSON value',
});
