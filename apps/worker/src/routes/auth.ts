import {
	enrollRequestSchema,
	linkFinishRequestSchema,
	normalizeAccountKey,
	normalizeLinkCode,
} from '@hourtrail/core';
import { Hono } from 'hono';
import {
	checkLockout,
	clearSessionCookie,
	countFailure,
	enrollDevice,
	equalDigests,
	requireDevice,
	sha256,
} from '../auth';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { parseJson } from '../validate';

export const auth = new Hono<AppEnv>();

auth.post('/enroll', async (c) => {
	await checkLockout(c);
	const input = await parseJson(c, enrollRequestSchema);
	if (!c.env.ACCOUNT_KEY_HASH) {
		console.error('ACCOUNT_KEY_HASH is not configured');
		throw new ApiError(500, 'internal', 'Something went wrong.');
	}
	const key = normalizeAccountKey(input.account_key);
	if (!key || !equalDigests(await sha256(key), c.env.ACCOUNT_KEY_HASH)) {
		await countFailure(c);
		throw new ApiError(401, 'unauthorized', 'That account key does not match.');
	}
	const device = await enrollDevice(c, input.device_id, input.device_name);
	return c.json({ device: { ...device, current: true }, server_time: Date.now() }, 201);
});

auth.post('/link/finish', async (c) => {
	await checkLockout(c);
	const input = await parseJson(c, linkFinishRequestSchema);
	const code = normalizeLinkCode(input.code);
	const now = Date.now();
	const consumed = code
		? await c.env.DB.prepare(
				`UPDATE link_codes SET used_at = ?
		WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?`,
			)
				.bind(now, await sha256(code), now)
				.run()
		: null;
	if (consumed?.meta.changes !== 1) {
		await countFailure(c);
		throw new ApiError(
			401,
			'unauthorized',
			'That code is not valid. Codes work once, for five minutes.',
		);
	}
	const device = await enrollDevice(c, input.device_id, input.device_name);
	return c.json({ device: { ...device, current: true }, server_time: Date.now() }, 201);
});

auth.post('/link/start', requireDevice, async (c) => {
	const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
	const code = Array.from(
		crypto.getRandomValues(new Uint8Array(8)),
		(byte) => alphabet[byte & 31],
	).join('');
	const now = Date.now();
	const expires_at = now + 5 * 60 * 1000;
	await c.env.DB.batch([
		c.env.DB.prepare('DELETE FROM link_codes WHERE expires_at <= ?').bind(now),
		c.env.DB.prepare(
			'INSERT INTO link_codes (code_hash, created_by, created_at, expires_at) VALUES (?, ?, ?, ?)',
		).bind(await sha256(code), c.var.device.id, now, expires_at),
	]);
	return c.json({ code, expires_at }, 201);
});

auth.get('/session', requireDevice, (c) =>
	c.json({ device: { ...c.var.device, current: true }, server_time: Date.now() }),
);

auth.get('/devices', requireDevice, async (c) => {
	const rows = await c.env.DB.prepare(
		`SELECT id, name, created_at, last_seen_at
		FROM devices WHERE revoked_at IS NULL ORDER BY last_seen_at DESC`,
	).all();
	return c.json({
		devices: rows.results.map((device) => ({ ...device, current: device.id === c.var.device.id })),
	});
});

auth.delete('/devices/:id', requireDevice, async (c) => {
	const id = c.req.param('id');
	const result = await c.env.DB.prepare(
		'UPDATE devices SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?',
	)
		.bind(Date.now(), id)
		.run();
	if (!result.meta.changes) throw new ApiError(404, 'not_found', 'No such device.');
	if (id === c.var.device.id) clearSessionCookie(c);
	return c.body(null, 204);
});

auth.post('/signout', requireDevice, async (c) => {
	await c.env.DB.prepare('UPDATE devices SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?')
		.bind(Date.now(), c.var.device.id)
		.run();
	clearSessionCookie(c);
	return c.body(null, 204);
});
