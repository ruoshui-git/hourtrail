import { z } from 'zod';
import { idTimestamp, newId } from '../ids';
import { ENTITIES, epochSchema, uuidSchema } from '../schema';
import type { Entity } from '../schema';
import type { AnyRecord } from './apply';
import { checkField, equal, managedFields, MutationError, recordValue } from './validation';

export { MutationError } from './validation';

export type FieldChange = { from: unknown; to: unknown };
export type Mutation = {
	id: string;
	entity: Entity;
	record_id: string;
	kind: 'put' | 'patch' | 'delete' | 'undelete';
	value?: Record<string, unknown>;
	fields?: Record<string, FieldChange>;
	at: number;
	device_id: string;
};
export type Batch = {
	batch_id: string;
	device_id: string;
	mode?: 'restore';
	mutations: Mutation[];
};
export const MAX_BATCH = 50;
type WriteContext = { now: number; deviceId: string };
const mutationIdSchema = uuidSchema.refine((id) => idTimestamp(id) !== null, 'Expected UUIDv7');

const mutationShape = z
	.strictObject({
		id: mutationIdSchema,
		entity: z.enum(ENTITIES),
		record_id: z.string(),
		kind: z.enum(['put', 'patch', 'delete', 'undelete']),
		value: z.record(z.string(), z.json()).optional(),
		fields: z.record(z.string(), z.strictObject({ from: z.json(), to: z.json() })).optional(),
		at: epochSchema,
		device_id: z.string(),
	})
	.superRefine((m, ctx) => {
		try {
			if (m.kind === 'put') {
				const value = recordValue(m.entity, m.value);
				if (value.id !== m.record_id) throw new MutationError('Put id must match record_id');
			} else if (m.kind === 'patch') {
				if (!m.fields) throw new MutationError('Patch requires fields');
				for (const [field, change] of Object.entries(m.fields)) {
					checkField(m.entity, field, change.from);
					checkField(m.entity, field, change.to);
				}
			}
			if (m.kind !== 'put' && m.value !== undefined)
				throw new MutationError('Only put accepts value');
			if (m.kind !== 'patch' && m.fields !== undefined)
				throw new MutationError('Only patch accepts fields');
		} catch (error) {
			if (!(error instanceof MutationError)) throw error;
			ctx.addIssue({ code: 'custom', message: error.message });
		}
	});

export const mutationSchema: z.ZodType<Mutation> = z.preprocess((input, ctx) => {
	// Zod's record parser omits __proto__; reject it before parsing can discard the field.
	if (input !== null && typeof input === 'object' && 'fields' in input) {
		const fields = input.fields;
		if (fields !== null && typeof fields === 'object' && Object.hasOwn(fields, '__proto__')) {
			ctx.addIssue({ code: 'custom', message: 'Cannot patch __proto__' });
		}
	}
	return input;
}, mutationShape);

export const batchSchema: z.ZodType<Batch> = z
	.strictObject({
		batch_id: mutationIdSchema,
		device_id: z.string(),
		mode: z.literal('restore').optional(),
		mutations: z.array(mutationSchema).max(MAX_BATCH),
	})
	.refine((batch) => batch.mutations.every((m) => m.device_id === batch.device_id), {
		message: 'Mutation devices must match the batch device',
	});

export function checkedMutation(m: Mutation): Mutation {
	const parsed = mutationSchema.safeParse(m);
	if (!parsed.success) throw new MutationError(parsed.error.message);
	if (!equal(parsed.data, m))
		throw new MutationError('Mutation contains fields that would be discarded');
	return parsed.data;
}

export function makeBatches(
	deviceId: string,
	mutations: Mutation[],
	mode?: 'restore',
	id: () => string = newId,
): Batch[] {
	const batches: Batch[] = [];
	for (let i = 0; i < mutations.length; i += MAX_BATCH) {
		const batch: Batch = {
			batch_id: id(),
			device_id: deviceId,
			...(mode === undefined ? {} : { mode }),
			mutations: mutations.slice(i, i + MAX_BATCH),
		};
		const parsed = batchSchema.safeParse(batch);
		if (!parsed.success) throw new MutationError(parsed.error.message);
		batches.push(parsed.data);
	}
	return batches;
}

function base(entity: Entity, recordId: string, ctx: WriteContext) {
	return { id: newId(ctx.now), entity, record_id: recordId, at: ctx.now, device_id: ctx.deviceId };
}

export function putMutation(entity: Entity, record: AnyRecord, ctx: WriteContext): Mutation {
	return checkedMutation({ ...base(entity, record.id, ctx), kind: 'put', value: record });
}

export function patchMutation(
	entity: Entity,
	before: AnyRecord,
	changes: Record<string, unknown>,
	ctx: WriteContext,
): Mutation | null {
	recordValue(entity, before);
	const fields: Record<string, FieldChange> = {};
	for (const [field, to] of Object.entries(changes)) {
		checkField(entity, field, to);
		const from = (before as Record<string, unknown>)[field];
		if (!equal(from, to))
			Object.defineProperty(fields, field, { value: { from, to }, enumerable: true });
	}
	if (Object.keys(fields).length === 0) return null;
	return checkedMutation({ ...base(entity, before.id, ctx), kind: 'patch', fields });
}

export function deleteMutation(entity: Entity, recordId: string, ctx: WriteContext): Mutation {
	return checkedMutation({ ...base(entity, recordId, ctx), kind: 'delete' });
}

export function undeleteMutation(entity: Entity, recordId: string, ctx: WriteContext): Mutation {
	return checkedMutation({ ...base(entity, recordId, ctx), kind: 'undelete' });
}

/** Apply these inverses in order; deletion timestamps are regenerated by delete mutations. */
export function invertMutation(
	m: Mutation,
	before: AnyRecord | null,
	ctx: WriteContext,
): Mutation[] {
	m = checkedMutation(m);
	if (before === null) return [deleteMutation(m.entity, m.record_id, ctx)];
	recordValue(m.entity, before);
	if (before.id !== m.record_id) throw new MutationError('Inverse record id mismatch');
	if (m.kind === 'delete') {
		return before.deleted_at === null ? [undeleteMutation(m.entity, m.record_id, ctx)] : [];
	}
	if (m.kind === 'undelete') {
		return before.deleted_at !== null ? [deleteMutation(m.entity, m.record_id, ctx)] : [];
	}
	// Put preserves deletion state on an existing id, including when undoing a put to a tombstone.
	if (m.kind === 'put') return [putMutation(m.entity, before, ctx)];
	const fields: Record<string, FieldChange> = {};
	for (const [field, change] of Object.entries(m.fields!)) {
		if (!managedFields.has(field)) {
			fields[field] = { from: change.to, to: (before as Record<string, unknown>)[field] };
		}
	}
	const inverse = checkedMutation({ ...base(m.entity, m.record_id, ctx), kind: 'patch', fields });
	return before.deleted_at === null
		? [inverse]
		: [inverse, deleteMutation(m.entity, m.record_id, ctx)];
}
