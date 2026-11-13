import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { sha256 } from '../src/auth';
import { TEST_ACCOUNT_KEY, TEST_ACCOUNT_KEY_HASH } from './auth-key';
import { expectApiHeaders, expectError, origin } from './helpers';

const firstId = '019a67c9-8000-7000-8000-000000000001';
const secondId = '019a67c9-8000-7000-8000-000000000002';
const app = createApp();
const now = Date.UTC(2026, 10, 13, 12);
const minute = 60_000;

async function request(path: string, method = 'GET', body?: unknown, cookie?: string) {
	return app.request(
		`${origin}/api/${path}`,
		{
			method,
			headers: {
				Origin: origin,
				'Content-Type': 'application/json',
				...(cookie ? { Cookie: cookie } : {}),
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		},
		env,
	);
}

async function enroll(id: string, key = TEST_ACCOUNT_KEY) {
	return request('auth/enroll', 'POST', { account_key: key, device_id: id, device_name: 'Phone' });
}

function cookieOf(response: Response) {
	return response.headers.get('Set-Cookie')!.split(';')[0]!;
}

beforeEach(async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(now);
	await env.DB.batch([
		env.DB.prepare('DELETE FROM records'),
		env.DB.prepare('DELETE FROM sync_batches'),
		env.DB.prepare('DELETE FROM link_codes'),
		env.DB.prepare('DELETE FROM push_subscriptions'),
		env.DB.prepare('DELETE FROM reminder_state'),
		env.DB.prepare('DELETE FROM devices'),
		env.DB.prepare('DELETE FROM meta'),
	]);
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('POST /api/account/erase', () => {
	it('rejects a wrong key, counts the failure, and honors the shared lockout', async () => {
		const login = await enroll(firstId);
		const cookie = cookieOf(login);
		const error = await expectError(
			await request('account/erase', 'POST', { account_key: 'wrong' }, cookie),
			401,
			'unauthorized',
		);
		expect(error.error.message).toBe('That account key does not match.');
		expect(
			JSON.parse(
				(await env.DB.prepare("SELECT value FROM meta WHERE key = 'auth_lockout'").first<{
					value: string;
				}>())!.value,
			).failures,
		).toBe(1);
		await env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'auth_lockout'")
			.bind(JSON.stringify({ failures: 0, level: 1, locked_until: now + minute }))
			.run();
		await expectError(
			await request('account/erase', 'POST', { account_key: TEST_ACCOUNT_KEY }, cookie),
			429,
			'locked',
		);
	});

	it('erases all cloud tables in one operation, signs out all devices, and allows fresh enrollment', async () => {
		const caller = cookieOf(await enroll(firstId));
		const other = cookieOf(await enroll(secondId));
		await env.DB.batch([
			env.DB.prepare("INSERT INTO records VALUES ('session_fix', 'x', 1, ?, NULL, '{}')").bind(now),
			env.DB.prepare("INSERT INTO sync_batches VALUES (1, 'batch', ?, ?, '{}')").bind(firstId, now),
			env.DB.prepare('INSERT INTO link_codes VALUES (?, ?, ?, ?, NULL)').bind(
				await sha256('12345678'),
				firstId,
				now,
				now + minute,
			),
			env.DB.prepare('INSERT INTO push_subscriptions VALUES (?, ?, ?, ?, ?)').bind(
				'endpoint',
				firstId,
				'p256dh',
				'auth',
				now,
			),
			env.DB.prepare('INSERT INTO reminder_state VALUES (?, ?, ?)').bind('session', now, 1),
			env.DB.prepare("INSERT INTO meta VALUES ('other', 'value')"),
		]);

		const response = await request(
			'account/erase',
			'POST',
			{ account_key: TEST_ACCOUNT_KEY },
			caller,
		);
		expect(response.status).toBe(204);
		expectApiHeaders(response);
		expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
		for (const table of [
			'records',
			'sync_batches',
			'link_codes',
			'push_subscriptions',
			'reminder_state',
			'devices',
		]) {
			expect(
				(await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>())
					?.count,
			).toBe(0);
		}
		expect(await env.DB.prepare('SELECT * FROM meta').all()).toMatchObject({
			results: [{ key: 'auth_lockout' }],
		});
		await expectError(await request('auth/session', 'GET', undefined, caller), 401, 'unauthorized');
		await expectError(await request('auth/session', 'GET', undefined, other), 401, 'unauthorized');
		const fresh = await enroll(firstId);
		expect(fresh.status).toBe(201);
		expect((await request('auth/session', 'GET', undefined, cookieOf(fresh))).status).toBe(200);
	});

	it('checks lockout before parsing the key and reuses the enrollment key digest check', async () => {
		const login = await enroll(firstId);
		const cookie = cookieOf(login);
		await env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'auth_lockout'")
			.bind(JSON.stringify({ failures: 0, level: 1, locked_until: now + minute }))
			.run();
		await expectError(await request('account/erase', 'POST', {}, cookie), 429, 'locked');
		vi.setSystemTime(now + minute);
		const response = await request(
			'account/erase',
			'POST',
			{ account_key: TEST_ACCOUNT_KEY },
			cookie,
		);
		expect(response.status).toBe(204);
		expect(await sha256(TEST_ACCOUNT_KEY)).toBe(TEST_ACCOUNT_KEY_HASH);
	});
});
