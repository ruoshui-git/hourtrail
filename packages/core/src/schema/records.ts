import { z } from 'zod';
import { BLAZE_KEYS } from '../blaze';
import { commonFields, daySchema, ENTITIES, epochSchema, uuidSchema, zoneSchema } from './common';
import type { Entity } from './common';
import { settingSchemas } from './settings';

export const activityTypeSchema = z.object({
	...commonFields,
	name: z.string(),
	color: z.enum(BLAZE_KEYS),
	sort_key: z.number(),
	counts_as_work: z.boolean(),
	remind: z.boolean(),
	archived_at: epochSchema.nullable(),
});

export const projectSchema = z.object({
	...commonFields,
	name: z.string(),
	archived_at: epochSchema.nullable(),
});

export const workItemSchema = z.object({
	...commonFields,
	name: z.string(),
	description: z.string(),
	type_id: uuidSchema,
	project_id: uuidSchema.nullable(),
	place_id: uuidSchema.nullable(),
	pinned_at: epochSchema.nullable(),
	pin_sort: z.number(),
	archived_at: epochSchema.nullable(),
});

export const sessionSchema = z.object({
	...commonFields,
	work_item_id: uuidSchema.nullable(),
	type_id: uuidSchema,
	start_at: epochSchema,
	end_at: epochSchema.nullable(),
	start_tz: zoneSchema,
	end_tz: zoneSchema.nullable(),
	note: z.string(),
	source: z.enum(['live', 'manual']),
	place_id: uuidSchema.nullable(),
	place_state: z.enum([
		'none',
		'pending',
		'set',
		'suggested',
		'ambiguous',
		'unresolved',
		'dismissed',
	]),
	place_candidates: z.array(uuidSchema),
	origin_device_id: z.string(),
	flags: z.object({ clock_suspect: z.boolean().optional() }),
});

export const placeSchema = z.object({
	...commonFields,
	name: z.string(),
	lat: z.number().min(-90).max(90),
	lng: z.number().min(-180).max(180),
	radius_m: z.int().min(25).max(2000),
	description: z.string(),
	archived_at: epochSchema.nullable(),
});

export type SessionFixKind = 'start' | 'end';
export function sessionFixId(sessionId: string, kind: SessionFixKind): string {
	return `${sessionId}:${kind}`;
}

export const sessionFixSchema = z
	.object({
		...commonFields,
		id: z.string(),
		session_id: uuidSchema,
		kind: z.enum(['start', 'end']),
		lat: z.number().min(-90).max(90),
		lng: z.number().min(-180).max(180),
		accuracy_m: z.number().nonnegative(),
		captured_at: epochSchema,
	})
	.refine((fix) => fix.id === sessionFixId(fix.session_id, fix.kind), {
		path: ['id'],
		message: 'Id must match session_id and kind',
	});

export function reviewMarkId(day: string, issueKey: string): string {
	return `${day}|${issueKey}`;
}

export const reviewMarkSchema = z
	.object({
		...commonFields,
		id: z.string(),
		day: daySchema,
		issue_key: z.string(),
		state: z.enum(['reviewed', 'dismissed']),
	})
	.refine((mark) => mark.id === reviewMarkId(mark.day, mark.issue_key), {
		path: ['id'],
		message: 'Id must match day and issue_key',
	});

export const dayReviewSchema = z.object({
	...commonFields,
	id: daySchema,
	finished_at: epochSchema,
});

export const settingSchema = z.object({
	...commonFields,
	id: z.enum(Object.keys(settingSchemas) as (keyof typeof settingSchemas)[]),
	value: z.json(),
});

export const reportPresetSchema = z.object({
	...commonFields,
	name: z.string(),
	config: z.json(),
});

export const conflictSchema = z.object({
	...commonFields,
	entity: z.enum(ENTITIES),
	record_id: z.string(),
	field: z.string(),
	kept_value: z.json(),
	other_value: z.json(),
	kept_device: z.string(),
	other_device: z.string(),
	at: epochSchema,
	resolved_at: epochSchema.nullable(),
});

export const schemas = {
	activity_type: activityTypeSchema,
	project: projectSchema,
	work_item: workItemSchema,
	session: sessionSchema,
	place: placeSchema,
	session_fix: sessionFixSchema,
	review_mark: reviewMarkSchema,
	day_review: dayReviewSchema,
	setting: settingSchema,
	report_preset: reportPresetSchema,
	conflict: conflictSchema,
} satisfies Record<Entity, z.ZodType>;

export type RecordOf<E extends Entity> = z.infer<(typeof schemas)[E]>;
export type ActivityType = RecordOf<'activity_type'>;
export type Project = RecordOf<'project'>;
export type WorkItem = RecordOf<'work_item'>;
export type Session = RecordOf<'session'>;
export type Place = RecordOf<'place'>;
export type SessionFix = RecordOf<'session_fix'>;
export type ReviewMark = RecordOf<'review_mark'>;
export type DayReview = RecordOf<'day_review'>;
export type Setting = RecordOf<'setting'>;
export type ReportPreset = RecordOf<'report_preset'>;
export type Conflict = RecordOf<'conflict'>;
