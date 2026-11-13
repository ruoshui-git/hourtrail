import { pushSubscribeRequestSchema, pushUnsubscribeRequestSchema } from '@hourtrail/core';
import { Hono } from 'hono';
import { requireDevice } from '../auth';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { parseJson } from '../validate';

export const push = new Hono<AppEnv>();
push.use('*', requireDevice);

push.get('/key', (c) => {
	if (!c.env.VAPID_PUBLIC_KEY || !c.env.VAPID_PRIVATE_KEY) {
		console.error('VAPID keys are not configured', { requestId: c.var.requestId });
		throw new ApiError(500, 'internal', 'Something went wrong.');
	}
	return c.json({ public_key: c.env.VAPID_PUBLIC_KEY });
});

push.post('/subscribe', async (c) => {
	const input = await parseJson(c, pushSubscribeRequestSchema);
	await c.env.DB.prepare(
		`INSERT INTO push_subscriptions (endpoint, device_id, p256dh, auth, created_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(endpoint) DO UPDATE SET device_id = excluded.device_id,
		p256dh = excluded.p256dh, auth = excluded.auth`,
	)
		.bind(input.endpoint, c.var.device.id, input.keys.p256dh, input.keys.auth, Date.now())
		.run();
	return c.body(null, 204);
});

push.delete('/subscribe', async (c) => {
	const input = await parseJson(c, pushUnsubscribeRequestSchema);
	await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND device_id = ?')
		.bind(input.endpoint, c.var.device.id)
		.run();
	return c.body(null, 204);
});
