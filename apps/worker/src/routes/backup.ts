import { backupHeartbeatSchema, backupStatusSchema } from '@hourtrail/core';
import { Hono } from 'hono';
import { equalDigests, requireDevice, sha256 } from '../auth';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { parseJson } from '../validate';

export const backup = new Hono<AppEnv>();

backup.post('/heartbeat', async (c) => {
	const secret = c.env.BACKUP_HEARTBEAT_SECRET;
	if (!secret) {
		console.error('Backup heartbeat secret is not configured', { requestId: c.var.requestId });
		throw new ApiError(500, 'internal', 'Something went wrong.');
	}
	const header = c.req.header('Authorization') ?? '';
	const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
	if (!supplied || !equalDigests(await sha256(supplied), await sha256(secret))) {
		throw new ApiError(401, 'unauthorized', 'Please sign in again.');
	}
	const parsed = await parseJson(c, backupHeartbeatSchema);
	const value = JSON.stringify({ at: Date.now(), ...parsed });
	await c.env.DB.prepare(
		`INSERT INTO meta (key, value) VALUES ('backup_heartbeat', ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
	)
		.bind(value)
		.run();
	return c.body(null, 204);
});

backup.get('/status', requireDevice, async (c) => {
	const row = await c.env.DB.prepare(
		"SELECT value FROM meta WHERE key = 'backup_heartbeat'",
	).first<{
		value: string;
	}>();
	const stored = row ? (JSON.parse(row.value) as { at: number; dump: string }) : null;
	return c.json(
		backupStatusSchema.parse({
			last_nightly_at: stored?.at ?? null,
			dump: stored?.dump ?? null,
		}),
	);
});
