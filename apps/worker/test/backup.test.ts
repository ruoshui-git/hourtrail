import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { Env } from '../src/env';
import { TEST_ACCOUNT_KEY } from './auth-key';
import { expectError, origin } from './helpers';

const app = createApp();
const id = '019a67c9-8000-7000-8000-000000000011';
const secret = 'test-backup-secret';

async function request(path: string, options: RequestInit = {}, bindings: Env = env) {
	return app.request(`https://hourtrail.example/api/backup${path}`, options, bindings);
}

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM devices'),
		env.DB.prepare("DELETE FROM meta WHERE key = 'backup_heartbeat'"),
	]);
});
afterEach(() => {
	delete env.BACKUP_HEARTBEAT_SECRET;
});

describe('backup heartbeat and status', () => {
	it('requires same-origin JSON headers and the configured bearer secret', async () => {
		env.BACKUP_HEARTBEAT_SECRET = secret;
		const body = JSON.stringify({ dump: 'hourtrail-2026-11-13.sql.age', bytes: 42 });
		await expectError(
			await request('/heartbeat', { method: 'POST', body }),
			403,
			'forbidden_origin',
		);
		await expectError(
			await request('/heartbeat', {
				method: 'POST',
				headers: { Origin: origin, 'Content-Type': 'application/json' },
				body,
			}),
			401,
			'unauthorized',
		);
		await expectError(
			await request('/heartbeat', {
				method: 'POST',
				headers: {
					Origin: origin,
					'Content-Type': 'application/json',
					Authorization: 'Bearer wrong',
				},
				body,
			}),
			401,
			'unauthorized',
		);
		const response = await request('/heartbeat', {
			method: 'POST',
			headers: {
				Origin: origin,
				'Content-Type': 'application/json',
				Authorization: `Bearer ${secret}`,
			},
			body,
		});
		expect(response.status).toBe(204);
		const stored = await env.DB.prepare(
			"SELECT value FROM meta WHERE key = 'backup_heartbeat'",
		).first<{
			value: string;
		}>();
		expect(JSON.parse(stored!.value)).toMatchObject({
			dump: 'hourtrail-2026-11-13.sql.age',
			bytes: 42,
		});
	});

	it('returns internal when no heartbeat secret is configured', async () => {
		delete env.BACKUP_HEARTBEAT_SECRET;
		await expectError(
			await request('/heartbeat', {
				method: 'POST',
				headers: { Origin: origin, 'Content-Type': 'application/json' },
				body: '{}',
			}),
			500,
			'internal',
		);
	});

	it('serves status only to a signed-in device', async () => {
		const unauthorized = await request('/status');
		await expectError(unauthorized, 401, 'unauthorized');
		const enrolled = await app.request(
			'https://hourtrail.example/api/auth/enroll',
			{
				method: 'POST',
				headers: { Origin: origin, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					account_key: TEST_ACCOUNT_KEY,
					device_id: id,
					device_name: 'test device',
				}),
			},
			env,
		);
		const cookie = enrolled.headers.get('Set-Cookie')!.split(';')[0]!;
		const response = await request('/status', { headers: { Cookie: cookie } });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ last_nightly_at: null, dump: null });
	});
});
