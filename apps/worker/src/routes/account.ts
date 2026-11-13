import { eraseAccountRequestSchema, normalizeAccountKey } from '@hourtrail/core';
import { Hono } from 'hono';
import {
	checkLockout,
	clearSessionCookie,
	countFailure,
	equalDigests,
	requireDevice,
	sha256,
} from '../auth';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { parseJson } from '../validate';

export const account = new Hono<AppEnv>();

account.post('/erase', requireDevice, async (c) => {
	await checkLockout(c);
	const input = await parseJson(c, eraseAccountRequestSchema);
	if (!c.env.ACCOUNT_KEY_HASH) {
		console.error('ACCOUNT_KEY_HASH is not configured');
		throw new ApiError(500, 'internal', 'Something went wrong.');
	}
	const key = normalizeAccountKey(input.account_key);
	if (!key || !equalDigests(await sha256(key), c.env.ACCOUNT_KEY_HASH)) {
		await countFailure(c);
		throw new ApiError(401, 'unauthorized', 'That account key does not match.');
	}
	const db = c.env.DB;
	await db.batch([
		db.prepare('DELETE FROM records'),
		db.prepare('DELETE FROM sync_batches'),
		db.prepare('DELETE FROM link_codes'),
		db.prepare('DELETE FROM push_subscriptions'),
		db.prepare('DELETE FROM reminder_state'),
		db.prepare('DELETE FROM devices'),
		db.prepare("DELETE FROM meta WHERE key != 'auth_lockout'"),
	]);
	clearSessionCookie(c);
	return c.body(null, 204);
});
