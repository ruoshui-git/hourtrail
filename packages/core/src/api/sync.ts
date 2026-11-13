import { z } from 'zod';
import { ENTITIES, epochSchema, uuidSchema } from '../schema/common';

export const pushAckSchema = z.strictObject({
	batch_id: uuidSchema,
	seq: z.int().nonnegative(),
	applied: z.int().nonnegative(),
	rejected: z.array(z.strictObject({ mutation_id: uuidSchema, reason: z.string() })),
	server_time: epochSchema,
});

const queryInteger = z.string().regex(/^\d+$/).transform(Number);
export const pullQuerySchema = z.strictObject({
	since: queryInteger.pipe(z.int().nonnegative()).default(0),
	limit: queryInteger.pipe(z.int().min(1).max(500)).default(500),
});

export const pullResponseSchema = z.strictObject({
	records: z.array(
		z.strictObject({
			entity: z.enum(ENTITIES),
			// Entity-specific validation happens when the client imports the record.
			record: z.object({ id: z.string(), rev: z.int() }).passthrough(),
		}),
	),
	next_since: z.int().nonnegative(),
	more: z.boolean(),
	server_time: epochSchema,
});

export type PushAck = z.infer<typeof pushAckSchema>;
export type PullResponse = z.infer<typeof pullResponseSchema>;
