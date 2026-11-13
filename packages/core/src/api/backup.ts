import { z } from 'zod';
import { epochSchema } from '../schema/common';

export const backupHeartbeatSchema = z.strictObject({
	dump: z.string().min(1).max(200),
	bytes: z.int().nonnegative(),
});

export const backupStatusSchema = z.strictObject({
	last_nightly_at: epochSchema.nullable(),
	dump: z.string().max(200).nullable(),
});

export type BackupHeartbeat = z.infer<typeof backupHeartbeatSchema>;
export type BackupStatus = z.infer<typeof backupStatusSchema>;
