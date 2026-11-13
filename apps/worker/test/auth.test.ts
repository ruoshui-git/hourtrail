import { createHash } from 'node:crypto';
import { env, SELF } from 'cloudflare:test';
import {
	devicesResponseSchema,
	formatLinkCode,
	linkStartResponseSchema,
	sessionResponseSchema,
} from '@hourtrail/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { equalDigests, sha256 } from '../src/auth';
import type { Env } from '../src/env';
import { TEST_ACCOUNT_KEY, TEST_ACCOUNT_KEY_HASH } from './auth-key';
import { expectApiHeaders, expectError, origin } from './helpers';

const firstId = '019a67c9-8000-7000-8000-000000000001';
const secondId = '019a67c9-8000-7000-8000-000000000002';
const thirdId = '019a67c9-8000-7000-8000-000000000003';
const now = Date.UTC(2026, 10, 13, 12);
const minute = 60_000;
const day = 24 * 60 * minute;
const attributes = 'Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=';
const cleared = `__Host-ht=; ${attributes}0`;
const app = createApp();

async function request(
	path: string,
	method = 'GET',
	body?: unknown,
	cookie?: string,
	bindings: Env = env,
) {
	return app.request(
		`${origin}/api/auth${path}`,
		{
			method,
			headers: {
				Origin: origin,
				'Content-Type': 'application/json',
				...(cookie ? { Cookie: cookie } : {}),
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		},
		bindings,
	);
}
function enroll(
	id = firstId,
	account_key = TEST_ACCOUNT_KEY,
	name = '第1寺院的手机',
	bindings: Env = env,
) {
	return request(
		'/enroll',
		'POST',
		{ account_key, device_id: id, device_name: name },
		undefined,
		bindings,
	);
}
function finish(code: string, id = secondId, bindings: Env = env) {
	return request(
		'/link/finish',
		'POST',
		{ code, device_id: id, device_name: '修复洗手台' },
		undefined,
		bindings,
	);
}
function cookieOf(response: Response): string {
	const header = response.headers.get('Set-Cookie');
	expect(header).toMatch(
		new RegExp(`^__Host-ht=[a-f0-9-]{36}\\.[A-Za-z0-9_-]{43}; ${attributes}34560000$`),
	);
	return header!.split(';')[0]!;
}
async function signedIn(id = firstId): Promise<string> {
	const response = await enroll(id);
	expect(response.status).toBe(201);
	await response.arrayBuffer();
	return cookieOf(response);
}
async function start(cookie: string) {
	const response = await request('/link/start', 'POST', undefined, cookie);
	expect(response.status).toBe(201);
	return linkStartResponseSchema.parse(await response.json());
}
async function lockout() {
	const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'auth_lockout'").first<{
		value: string;
	}>();
	return row ? JSON.parse(row.value) : null;
}
async function stored(id = firstId) {
	return env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(id).first<{
		id: string;
		name: string;
		token_hash: string;
		token_issued_at: number;
		created_at: number;
		last_seen_at: number;
		revoked_at: number | null;
	}>();
}

beforeEach(async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(now);
	await env.DB.batch([
		env.DB.prepare('DELETE FROM link_codes'),
		env.DB.prepare('DELETE FROM devices'),
		env.DB.prepare("DELETE FROM meta WHERE key = 'auth_lockout'"),
	]);
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('enrollment and session', () => {
	it('matches setup-account SHA-256 UTF-8 canonical hashing with a hard-coded digest', async () => {
		expect(createHash('sha256').update(TEST_ACCOUNT_KEY, 'utf8').digest('hex')).toBe(
			'842a8e7b26b31ce05ebcd481440916e981822e43abb0279a8450b0c8e5b1bfb1',
		);
		expect(await sha256(TEST_ACCOUNT_KEY)).toBe(TEST_ACCOUNT_KEY_HASH);
		expect(env.ACCOUNT_KEY_HASH).toBe(TEST_ACCOUNT_KEY_HASH);
	});
	it('compares all digest positions and rejects length mismatches', () => {
		expect(equalDigests(TEST_ACCOUNT_KEY_HASH, TEST_ACCOUNT_KEY_HASH)).toBe(true);
		for (let index = 0; index < 64; index++) {
			const changed =
				TEST_ACCOUNT_KEY_HASH.slice(0, index) +
				(TEST_ACCOUNT_KEY_HASH[index] === '0' ? '1' : '0') +
				TEST_ACCOUNT_KEY_HASH.slice(index + 1);
			expect(equalDigests(TEST_ACCOUNT_KEY_HASH, changed)).toBe(false);
		}
		expect(equalDigests('a', 'aa')).toBe(false);
	});
	it('enrolls using the client id, stores only a token hash and returns the HttpOnly session', async () => {
		const response = await enroll();
		expect(response.status).toBe(201);
		expectApiHeaders(response);
		const cookie = cookieOf(response);
		const session = sessionResponseSchema.parse(await response.json());
		expect(session).toEqual({
			device: {
				id: firstId,
				name: '第1寺院的手机',
				created_at: now,
				last_seen_at: now,
				current: true,
			},
			server_time: now,
		});
		const row = await stored();
		expect(row).toEqual({
			id: firstId,
			name: '第1寺院的手机',
			token_hash: await sha256(cookie.split('.')[1]!),
			token_issued_at: now,
			created_at: now,
			last_seen_at: now,
			revoked_at: null,
		});
		expect(JSON.stringify(row)).not.toContain(cookie.split('.')[1]!);
		const get = await request('/session', 'GET', undefined, cookie);
		expect(get.status).toBe(200);
		expectApiHeaders(get);
		expect(sessionResponseSchema.parse(await get.json())).toEqual(session);
		expect(get.headers.has('Set-Cookie')).toBe(false);
	});
	it('is mounted in the real Worker', async () => {
		const response = await SELF.fetch(`${origin}/api/auth/enroll`, {
			method: 'POST',
			headers: { Origin: origin, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				account_key: TEST_ACCOUNT_KEY,
				device_id: firstId,
				device_name: '库存管理系统开发',
			}),
		});
		expect(response.status).toBe(201);
		const cookie = cookieOf(response);
		await response.arrayBuffer();
		const session = await SELF.fetch(`${origin}/api/auth/session`, { headers: { Cookie: cookie } });
		expect(session.status).toBe(200);
		expect(sessionResponseSchema.parse(await session.json()).device.id).toBe(firstId);
	});
	it('normalizes lowercase, spaces, group dashes and O/I/L confusions', async () => {
		for (const one of ['i', 'l']) {
			const response = await enroll(firstId, ` ht1-o${one}23 4567-89ab-cdef-ghjk-mnpq-rstv-wxyz `);
			expect(response.status).toBe(201);
			await response.arrayBuffer();
		}
	});
	it.each(['wrong', 'HT1-1123456789ABCDEFGHJKMNPQRSTVWXYZ'])(
		'counts a wrong or malformed key: %s',
		async (key) => {
			const error = await expectError(await enroll(firstId, key), 401, 'unauthorized');
			expect(error.error.message).toBe('That account key does not match.');
			expect(await lockout()).toEqual({ failures: 1, level: 0, locked_until: 0 });
			expect(await stored()).toBeNull();
		},
	);
	it('re-enrolls an active id with a fresh token while retaining created_at', async () => {
		const original = await signedIn();
		vi.setSystemTime(now + minute);
		const response = await enroll(firstId, TEST_ACCOUNT_KEY, '  New phone  ');
		expect(response.status).toBe(201);
		const replacement = cookieOf(response);
		expect(replacement).not.toBe(original);
		expect(sessionResponseSchema.parse(await response.json()).device).toEqual({
			id: firstId,
			name: 'New phone',
			created_at: now,
			last_seen_at: now + minute,
			current: true,
		});
		await expectError(await request('/session', 'GET', undefined, original), 401, 'unauthorized');
		expect((await request('/session', 'GET', undefined, replacement)).status).toBe(200);
	});
	it('logs an unset secret without counting a failure', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		await expectError(
			await enroll(firstId, TEST_ACCOUNT_KEY, 'Phone', { ...env, ACCOUNT_KEY_HASH: undefined }),
			500,
			'internal',
		);
		expect(log).toHaveBeenCalledWith('ACCOUNT_KEY_HASH is not configured');
		expect(await lockout()).toBeNull();
	});
	it('rejects malformed JSON and invalid strict bodies without counting failures', async () => {
		for (const path of ['/enroll', '/link/finish']) {
			for (const body of [
				'{',
				'{}',
				JSON.stringify({
					account_key: TEST_ACCOUNT_KEY,
					code: '12345678',
					device_id: firstId,
					device_name: 'Phone',
				}),
			]) {
				await expectError(
					await app.request(
						`${origin}/api/auth${path}`,
						{
							method: 'POST',
							headers: { Origin: origin, 'Content-Type': 'application/json' },
							body,
						},
						env,
					),
					400,
					'invalid_request',
				);
			}
		}
		expect(await lockout()).toBeNull();
	});
});

describe('shared lockout', () => {
	async function failures() {
		for (let index = 0; index < 5; index++) {
			await expectError(
				index % 2 ? await finish('00000000') : await enroll(firstId, 'bad'),
				401,
				'unauthorized',
			);
		}
	}
	it('locks both endpoints for 15 minutes, doubles after expiry, and resets on success', async () => {
		await failures();
		expect(await lockout()).toEqual({ failures: 0, level: 1, locked_until: now + 15 * minute });
		vi.setSystemTime(now + 1);
		for (const response of [
			await enroll(),
			await finish('00000000'),
			await request('/enroll', 'POST', {}),
		]) {
			const error = await expectError(response, 429, 'locked');
			expect(error.error.message).toBe('Too many attempts. Try again later.');
			expect(error.error.details).toEqual({ retry_after_s: 900 });
			expect(response.headers.get('Retry-After')).toBe('900');
		}
		expect((await lockout()).failures).toBe(0);
		vi.setSystemTime(now + 15 * minute);
		await failures();
		expect(await lockout()).toEqual({ failures: 0, level: 2, locked_until: now + 45 * minute });
		vi.setSystemTime(now + 45 * minute);
		await signedIn();
		expect(await lockout()).toEqual({ failures: 0, level: 0, locked_until: 0 });
		await failures();
		expect((await lockout()).locked_until).toBe(now + 60 * minute);
	});
	it('does not escalate past the first lock when a burst of failures arrives at once', async () => {
		const responses = await Promise.all(Array.from({ length: 40 }, () => enroll(firstId, 'bad')));
		for (const response of responses) expect([401, 429]).toContain(response.status);
		expect(await lockout()).toEqual({ failures: 0, level: 1, locked_until: now + 15 * minute });
	});
	it('caps the lockout duration at 24 hours', async () => {
		await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('auth_lockout', ?)")
			.bind(JSON.stringify({ failures: 4, level: 7, locked_until: 0 }))
			.run();
		await expectError(await finish('bad'), 401, 'unauthorized');
		expect(await lockout()).toEqual({ failures: 0, level: 8, locked_until: now + day });
	});
	it('counts concurrent failures without losing updates', async () => {
		await Promise.all(
			Array.from({ length: 4 }, () =>
				enroll(firstId, 'bad').then((r) => expectError(r, 401, 'unauthorized')),
			),
		);
		expect((await lockout()).failures).toBe(4);
	});
});

describe('one-time device linking', () => {
	it('stores only the hash, accepts formatted codes from a new device, and resets lockout', async () => {
		const cookie = await signedIn();
		const link = await start(cookie);
		expect(link.expires_at).toBe(now + 5 * minute);
		expect(await env.DB.prepare('SELECT * FROM link_codes').all()).toMatchObject({
			results: [
				{
					code_hash: await sha256(link.code),
					created_by: firstId,
					created_at: now,
					expires_at: now + 5 * minute,
					used_at: null,
				},
			],
		});
		await expectError(await enroll(firstId, 'bad'), 401, 'unauthorized');
		vi.setSystemTime(now + 5 * minute - 1);
		const response = await finish(formatLinkCode(link.code).toLowerCase());
		expect(response.status).toBe(201);
		const linkedCookie = cookieOf(response);
		expect(sessionResponseSchema.parse(await response.json()).device).toMatchObject({
			id: secondId,
			name: '修复洗手台',
			current: true,
		});
		expect(await lockout()).toEqual({ failures: 0, level: 0, locked_until: 0 });
		expect((await request('/session', 'GET', undefined, linkedCookie)).status).toBe(200);
		const error = await expectError(await finish(link.code, thirdId), 401, 'unauthorized');
		expect(error.error.message).toBe('That code is not valid. Codes work once, for five minutes.');
		expect((await lockout()).failures).toBe(1);
	});
	it('consumes a code atomically under concurrent requests', async () => {
		const code = (await start(await signedIn())).code;
		const responses = await Promise.all([finish(code, secondId), finish(code, thirdId)]);
		expect(responses.map((r) => r.status).sort()).toEqual([201, 401]);
		for (const response of responses) await response.arrayBuffer();
	});
	it('rejects unknown, malformed, and exactly expired codes and cleans expired rows', async () => {
		const cookie = await signedIn();
		const { code } = await start(cookie);
		vi.setSystemTime(now + 5 * minute);
		for (const bad of [code, '00000000', 'bad']) {
			const error = await expectError(await finish(bad), 401, 'unauthorized');
			expect(error.error.message).toBe(
				'That code is not valid. Codes work once, for five minutes.',
			);
		}
		expect((await lockout()).failures).toBe(3);
		const next = await start(cookie);
		expect(await env.DB.prepare('SELECT code_hash FROM link_codes').all()).toMatchObject({
			results: [{ code_hash: await sha256(next.code) }],
		});
	});
	it('does not consume a valid code while locked', async () => {
		const { code } = await start(await signedIn());
		await env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'auth_lockout'")
			.bind(JSON.stringify({ failures: 0, level: 1, locked_until: now + minute }))
			.run();
		await expectError(await finish(code), 429, 'locked');
		expect(await env.DB.prepare('SELECT used_at FROM link_codes').first('used_at')).toBeNull();
		vi.setSystemTime(now + minute);
		const response = await finish(code);
		expect(response.status).toBe(201);
		await response.arrayBuffer();
	});
	it('re-links an existing revoked id with a fresh token and preserves created_at', async () => {
		const originalCookie = await signedIn(secondId);
		await request('/signout', 'POST', undefined, originalCookie);
		const cookie = await signedIn();
		vi.setSystemTime(now + minute);
		const response = await finish((await start(cookie)).code, secondId);
		expect(response.status).toBe(201);
		expect(cookieOf(response)).not.toBe(originalCookie);
		await response.arrayBuffer();
		expect(await stored(secondId)).toMatchObject({
			created_at: now,
			last_seen_at: now + minute,
			revoked_at: null,
		});
	});
});

const protectedRoutes = [
	['GET', '/session'],
	['GET', '/devices'],
	['POST', '/link/start'],
	['DELETE', `/devices/${firstId}`],
	['POST', '/signout'],
] as const;

describe('device authentication, listing and revocation', () => {
	it.each(protectedRoutes)('requires a cookie for %s %s', async (method, path) => {
		const response = await request(path, method);
		const error = await expectError(response, 401, 'unauthorized');
		expect(error.error.message).toBe('Please sign in again.');
		expect(response.headers.get('Set-Cookie')).toBe(cleared);
	});
	it.each(protectedRoutes.filter(([method]) => method !== 'GET'))(
		'runs Origin and JSON guards before auth for %s %s',
		async (method, path) => {
			for (const headers of [{}, { Origin: 'https://other.example' }] as Record<string, string>[]) {
				const response = await app.request(`${origin}/api/auth${path}`, { method, headers }, env);
				await expectError(response, 403, 'forbidden_origin');
				expect(response.headers.has('Set-Cookie')).toBe(false);
			}
			const response = await app.request(
				`${origin}/api/auth${path}`,
				{ method, headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: '{}' },
				env,
			);
			await expectError(response, 415, 'unsupported_media_type');
			expect(response.headers.has('Set-Cookie')).toBe(false);
		},
	);
	it('clears malformed, unknown, duplicate and mismatched cookies', async () => {
		const cookie = await signedIn();
		const token = cookie.split('.')[1]!;
		for (const invalid of [
			'other=value',
			'__Host-ht=bad',
			`__Host-ht=${firstId}.short`,
			`__Host-ht=bad.${token}`,
			`__Host-ht=${firstId}.${token}.extra`,
			`__Host-ht=${thirdId}.${token}`,
			`__Host-ht=${firstId}.${'A'.repeat(43)}`,
			`${cookie}; ${cookie}`,
		]) {
			const response = await request('/session', 'GET', undefined, invalid);
			await expectError(response, 401, 'unauthorized');
			expect(response.headers.get('Set-Cookie')).toBe(cleared);
		}
	});
	it('lists unrevoked devices by last seen, preserving Chinese names and marking current', async () => {
		const first = await signedIn();
		vi.setSystemTime(now + minute);
		const second = await signedIn(secondId);
		vi.setSystemTime(now + 2 * minute);
		await signedIn(thirdId);
		await request(`/devices/${thirdId}`, 'DELETE', undefined, first);
		const response = await request('/devices', 'GET', undefined, second);
		expect(response.status).toBe(200);
		expect(devicesResponseSchema.parse(await response.json())).toEqual({
			devices: [
				{
					id: secondId,
					name: '第1寺院的手机',
					created_at: now + minute,
					last_seen_at: now + minute,
					current: true,
				},
				{ id: firstId, name: '第1寺院的手机', created_at: now, last_seen_at: now, current: false },
			],
		});
	});
	it('revokes another device idempotently and rejects it on every authenticated route', async () => {
		const first = await signedIn();
		const second = await signedIn(secondId);
		for (let index = 0; index < 2; index++) {
			const response = await request(`/devices/${secondId}`, 'DELETE', undefined, first);
			expect(response.status).toBe(204);
			expect(await response.text()).toBe('');
			expect(response.headers.has('Set-Cookie')).toBe(false);
		}
		await expectError(
			await request(`/devices/${thirdId}`, 'DELETE', undefined, first),
			404,
			'not_found',
		);
		for (const [method, path] of protectedRoutes) {
			const response = await request(path, method, undefined, second);
			await expectError(response, 401, 'unauthorized');
			expect(response.headers.get('Set-Cookie')).toBe(cleared);
		}
	});
	it.each(['/signout', `/devices/${firstId}`])(
		'revokes and clears the calling device through %s; re-enrollment restores its id',
		async (path) => {
			const cookie = await signedIn();
			const old = await stored();
			const response = await request(
				path,
				path === '/signout' ? 'POST' : 'DELETE',
				undefined,
				cookie,
			);
			expect(response.status).toBe(204);
			expect(await response.text()).toBe('');
			expect(response.headers.get('Set-Cookie')).toBe(cleared);
			expect((await stored())?.revoked_at).toBe(now);
			await expectError(await request('/session', 'GET', undefined, cookie), 401, 'unauthorized');
			vi.setSystemTime(now + minute);
			const restored = await enroll(firstId, TEST_ACCOUNT_KEY, '库存管理系统开发');
			expect(restored.status).toBe(201);
			const newCookie = cookieOf(restored);
			expect(newCookie).not.toBe(cookie);
			await restored.arrayBuffer();
			expect(await stored()).toMatchObject({
				id: firstId,
				name: '库存管理系统开发',
				revoked_at: null,
				created_at: old!.created_at,
				last_seen_at: now + minute,
				token_issued_at: now + minute,
			});
			expect((await request('/session', 'GET', undefined, newCookie)).status).toBe(200);
			await expectError(await request('/session', 'GET', undefined, cookie), 401, 'unauthorized');
		},
	);
});

// Count D1 executions, including statement calls and batches, without counting prepare/bind.
function countedDB() {
	let calls = 0;
	function statement(stmt: D1PreparedStatement): D1PreparedStatement {
		return new Proxy(stmt, {
			get(target, property) {
				if (property === 'bind') return (...values: unknown[]) => statement(target.bind(...values));
				const value = Reflect.get(target, property);
				if (typeof value !== 'function') return value;
				return (...args: unknown[]) => {
					calls++;
					return Reflect.apply(value, target, args);
				};
			},
		});
	}
	const db = new Proxy(env.DB, {
		get(target, property) {
			if (property === 'prepare') return (query: string) => statement(target.prepare(query));
			const value = Reflect.get(target, property);
			if (typeof value !== 'function') return value;
			return (...args: unknown[]) => {
				calls++;
				return Reflect.apply(value, target, args);
			};
		},
	});
	return {
		bindings: { ...env, DB: db },
		count: () => calls,
		reset: () => {
			calls = 0;
		},
	};
}

describe('session maintenance and D1 budget', () => {
	it('throttles last_seen_at writes at ten minutes and refreshes the same cookie only after thirty days', async () => {
		const cookie = await signedIn();
		const counted = countedDB();
		for (const elapsed of [minute, 10 * minute]) {
			vi.setSystemTime(now + elapsed);
			counted.reset();
			const response = await request('/session', 'GET', undefined, cookie, counted.bindings);
			expect(response.status).toBe(200);
			await response.arrayBuffer();
			expect(counted.count()).toBe(1);
			expect((await stored())?.last_seen_at).toBe(now);
			expect(response.headers.has('Set-Cookie')).toBe(false);
		}
		vi.setSystemTime(now + 10 * minute + 1);
		counted.reset();
		const seen = await request('/session', 'GET', undefined, cookie, counted.bindings);
		expect(sessionResponseSchema.parse(await seen.json()).device.last_seen_at).toBe(
			now + 10 * minute + 1,
		);
		expect(counted.count()).toBe(2);
		expect((await stored())?.last_seen_at).toBe(now + 10 * minute + 1);
		vi.setSystemTime(now + 30 * day);
		const boundary = await request('/session', 'GET', undefined, cookie);
		expect(boundary.headers.has('Set-Cookie')).toBe(false);
		await boundary.arrayBuffer();
		vi.setSystemTime(now + 30 * day + 1);
		counted.reset();
		const refreshed = await request('/session', 'GET', undefined, cookie, counted.bindings);
		expect(refreshed.status).toBe(200);
		await refreshed.arrayBuffer();
		expect(cookieOf(refreshed)).toBe(cookie);
		expect(counted.count()).toBe(2);
		expect(await stored()).toMatchObject({
			token_issued_at: now + 30 * day + 1,
			token_hash: await sha256(cookie.split('.')[1]!),
		});
		const concurrent = await Promise.all([
			request('/session', 'GET', undefined, cookie),
			request('/session', 'GET', undefined, cookie),
		]);
		for (const response of concurrent) {
			expect(response.status).toBe(200);
			expect(response.headers.has('Set-Cookie')).toBe(false);
			await response.arrayBuffer();
		}
	});
	it('retains cookie renewal when an authenticated handler returns an error', async () => {
		const cookie = await signedIn();
		vi.setSystemTime(now + 31 * day);
		const response = await request(`/devices/${thirdId}`, 'DELETE', undefined, cookie);
		await expectError(response, 404, 'not_found');
		expect(cookieOf(response)).toBe(cookie);
	});
	it('keeps success, failure and locked enrollment/link paths and authenticated routes within four D1 calls', async () => {
		const counted = countedDB();
		async function budget(run: () => Promise<Response>, status: number) {
			counted.reset();
			const response = await run();
			expect(response.status).toBe(status);
			await response.arrayBuffer();
			expect(counted.count()).toBeLessThanOrEqual(4);
			return response;
		}
		const cookie = cookieOf(
			await budget(() => enroll(firstId, TEST_ACCOUNT_KEY, 'Phone', counted.bindings), 201),
		);
		await budget(() => enroll(firstId, 'bad', 'Phone', counted.bindings), 401);
		const link = await start(cookie);
		await budget(() => finish('00000000', thirdId, counted.bindings), 401);
		await budget(() => finish(link.code, secondId, counted.bindings), 201);
		await budget(() => finish(link.code, thirdId, counted.bindings), 401);
		vi.setSystemTime(now + 31 * day);
		await budget(() => request('/session', 'GET', undefined, cookie, counted.bindings), 200);
		await budget(() => request('/devices', 'GET', undefined, cookie, counted.bindings), 200);
		await budget(() => request('/link/start', 'POST', undefined, cookie, counted.bindings), 201);
		await budget(
			() => request(`/devices/${secondId}`, 'DELETE', undefined, cookie, counted.bindings),
			204,
		);
		await env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'auth_lockout'")
			.bind(JSON.stringify({ failures: 0, level: 1, locked_until: Date.now() + minute }))
			.run();
		await budget(() => enroll(firstId, TEST_ACCOUNT_KEY, 'Phone', counted.bindings), 429);
		await budget(() => finish(link.code, thirdId, counted.bindings), 429);
	});
});
