import { env } from 'cloudflare:test';
import {
	DEFAULT_ACTIVITY_TYPES,
	newId,
	PERSONAL_TYPE_ID,
	WORK_TYPE_ID,
	type Session,
	type SettingValues,
} from '@hourtrail/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import type { Env } from '../src/env';
import worker from '../src/index';
import { MAX_REMINDER_SENDS } from '../src/push/reminder-cron';
import { encryptWebPush } from '../src/push/web-push';
import { expectApiHeaders, expectError, origin } from './helpers';
import { decode64, decryptPush, subscriptionKeys, vapidKeys } from './push-crypto-helpers';
import {
	deviceA,
	deviceB,
	now,
	proxiedDB,
	request,
	session,
	signedIn,
	snapshot,
} from './sync-helpers';

const minute = 60_000;
const endpoint = 'https://push.example/subscriptions/0';
const app = createApp();
let receiver: Awaited<ReturnType<typeof subscriptionKeys>>;
let vapid: Awaited<ReturnType<typeof vapidKeys>>;
let bindings: Env;
let captured: Request[];

beforeAll(async () => {
	receiver = await subscriptionKeys();
	vapid = await vapidKeys();
});
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
	bindings = {
		...env,
		APP_ORIGIN: origin,
		VAPID_PUBLIC_KEY: vapid.publicKey,
		VAPID_PRIVATE_KEY: vapid.privateKey,
	};
	captured = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		captured.push(new Request(input, init));
		return new Response(null, { status: 201 });
	});
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function subscribe(cookie: string, url = endpoint, keys = receiver.keys) {
	return request('push/subscribe', 'POST', { endpoint: url, keys }, cookie, bindings);
}
async function store(
	entity: string,
	record: { id: string; deleted_at?: number | null; [key: string]: unknown },
) {
	await env.DB.prepare('INSERT OR REPLACE INTO records VALUES (?, ?, 1, ?, ?, ?)')
		.bind(entity, record.id, now, record.deleted_at ?? null, JSON.stringify(record))
		.run();
}
async function seed(
	count = 1,
	subscriptionCount = 1,
	setting: SettingValues['reminder'] = { enabled: true, threshold_min: 240, repeat_min: null },
) {
	const cookie = await signedIn();
	for (let i = 0; i < subscriptionCount; i++) {
		vi.setSystemTime(now + i);
		expect((await subscribe(cookie, `https://push.example/subscriptions/${i}`)).status).toBe(204);
	}
	vi.setSystemTime(now);
	for (const type of DEFAULT_ACTIVITY_TYPES) await store('activity_type', type);
	const common = {
		rev: 1,
		created_at: now,
		updated_at: now,
		updated_by: deviceA,
		deleted_at: null,
	};
	await store('setting', { ...common, id: 'reminder', value: setting });
	const workId = newId(now);
	await store('work_item', {
		...common,
		id: workId,
		name: '库存管理系统开发 第1寺院 修复洗手台',
		description: '',
		type_id: PERSONAL_TYPE_ID,
		project_id: null,
		place_id: null,
		pinned_at: null,
		pin_sort: 0,
		archived_at: null,
	});
	const sessions: Session[] = [];
	for (let i = 0; i < count; i++) {
		const record = { ...session(), start_at: now - (240 + i) * minute, work_item_id: workId };
		sessions.push(record);
		await store('session', record);
	}
	return { cookie, sessions, workId };
}
async function cron(time = now, cronEnv = bindings) {
	await worker.scheduled({ scheduledTime: time, cron: '*/5 * * * *', noRetry() {} }, cronEnv);
}
async function state() {
	return (await env.DB.prepare('SELECT * FROM reminder_state ORDER BY session_id').all()).results;
}
async function payload(request: Request) {
	return JSON.parse(await decryptPush(await request.clone().arrayBuffer(), receiver));
}

describe('push subscription routes', () => {
	it('authenticates every route and returns only the public VAPID key with API headers', async () => {
		for (const [path, method, body] of [
			['push/key', 'GET', undefined],
			['push/subscribe', 'POST', { endpoint, keys: receiver.keys }],
			['push/subscribe', 'DELETE', { endpoint }],
		] as const)
			await expectError(
				await request(path, method, body, undefined, bindings),
				401,
				'unauthorized',
			);
		const cookie = await signedIn();
		const response = await request('push/key', 'GET', undefined, cookie, bindings);
		expect(response.status).toBe(200);
		expectApiHeaders(response);
		expect(await response.json()).toEqual({ public_key: vapid.publicKey });
	});
	it('upserts keys and owner by endpoint, and only the owner can unsubscribe', async () => {
		const a = await signedIn();
		const b = await signedIn(deviceB);
		const response = await subscribe(a);
		expect(response.status).toBe(204);
		expectApiHeaders(response);
		const replacement = await subscriptionKeys();
		vi.setSystemTime(now + minute);
		expect((await subscribe(b, endpoint, replacement.keys)).status).toBe(204);
		expect((await env.DB.prepare('SELECT * FROM push_subscriptions').all()).results).toEqual([
			{ endpoint, device_id: deviceB, ...replacement.keys, created_at: now },
		]);
		expect((await request('push/subscribe', 'DELETE', { endpoint }, a, bindings)).status).toBe(204);
		expect((await env.DB.prepare('SELECT * FROM push_subscriptions').all()).results).toHaveLength(
			1,
		);
		expect((await request('push/subscribe', 'DELETE', { endpoint }, b, bindings)).status).toBe(204);
		expect((await request('push/subscribe', 'DELETE', { endpoint }, b, bindings)).status).toBe(204);
		expect((await env.DB.prepare('SELECT * FROM push_subscriptions').all()).results).toEqual([]);
	});
	it.each(['POST', 'DELETE'])('enforces Origin and JSON rules for %s', async (method) => {
		const cookie = await signedIn();
		const body = JSON.stringify(
			method === 'POST' ? { endpoint, keys: receiver.keys } : { endpoint },
		);
		for (const foreign of [undefined, 'https://foreign.example', `${origin}/`]) {
			await expectError(
				await app.request(
					`${origin}/api/push/subscribe`,
					{
						method,
						headers: {
							Cookie: cookie,
							'Content-Type': 'application/json',
							...(foreign ? { Origin: foreign } : {}),
						},
						body,
					},
					bindings,
				),
				403,
				'forbidden_origin',
			);
		}
		await expectError(
			await app.request(
				`${origin}/api/push/subscribe`,
				{ method, headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'text/plain' }, body },
				bindings,
			),
			415,
			'unsupported_media_type',
		);
		expect((await env.DB.prepare('SELECT * FROM push_subscriptions').all()).results).toEqual([]);
	});
	it('rejects invalid endpoints and keys without writing a subscription', async () => {
		const cookie = await signedIn();
		await expectError(
			await subscribe(cookie, 'http://push.example/device'),
			400,
			'invalid_request',
		);
		await expectError(
			await subscribe(cookie, endpoint, { p256dh: 'bad', auth: 'bad' }),
			400,
			'invalid_request',
		);
		await expectError(
			await request('push/subscribe', 'DELETE', { endpoint: '/relative' }, cookie, bindings),
			400,
			'invalid_request',
		);
		expect((await env.DB.prepare('SELECT * FROM push_subscriptions').all()).results).toEqual([]);
	});
	it.each(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'] as const)(
		'logs and returns internal when %s is missing; cron logs once without D1 work',
		async (missing) => {
			const cookie = await signedIn();
			const broken = { ...bindings, [missing]: undefined };
			const log = vi.spyOn(console, 'error').mockImplementation(() => {});
			await expectError(
				await request('push/key', 'GET', undefined, cookie, broken),
				500,
				'internal',
			);
			expect(log).toHaveBeenCalledWith(
				'VAPID keys are not configured',
				expect.objectContaining({ requestId: expect.any(String) }),
			);
			log.mockClear();
			const db = proxiedDB();
			await cron(now, { ...broken, DB: db.bindings.DB });
			expect(log).toHaveBeenCalledExactlyOnceWith('VAPID keys are not configured');
			expect(db.calls()).toBe(0);
			expect(captured).toHaveLength(0);
		},
	);
});

describe('reminder cron', () => {
	it('sends exactly due sessions to every device, preserves all records, and sends only after the repeat interval', async () => {
		const { sessions } = await seed(2, 3, { enabled: true, threshold_min: 240, repeat_min: 30 });
		for (const changes of [
			{ start_at: now - 240 * minute + 1 },
			{ type_id: PERSONAL_TYPE_ID },
			{ end_at: now },
			{ deleted_at: now },
			{ type_id: newId(now) },
		])
			await store('session', { ...session(), start_at: now - 300 * minute, ...changes });
		const before = await snapshot();
		const db = proxiedDB();
		await cron(now, { ...bindings, DB: db.bindings.DB });
		expect(db.calls()).toBe(3); // One joined decision read, one subscription read, one write batch.
		expect(db.batches).toHaveLength(1);
		expect(db.batches[0]).toHaveLength(2);
		expect(captured).toHaveLength(6);
		const delivered = await Promise.all(captured.map(payload));
		for (const record of sessions) {
			expect(
				delivered.filter((p) => p.notification.navigate === `/?check=${record.id}`),
			).toHaveLength(3);
		}
		expect(delivered[0]).toEqual({
			web_push: 8030,
			notification: {
				title: 'Still working?',
				body: '库存管理系统开发 第1寺院 修复洗手台 has been running for 4h 01m.',
				navigate: `/?check=${sessions[1]!.id}`,
			},
		});
		for (let i = 0; i < 3; i++)
			expect(captured.filter((r) => r.url.endsWith(`/${i}`))).toHaveLength(2);
		expect(await state()).toEqual(
			sessions
				.map((s) => ({ session_id: s.id, last_sent_at: now, sent_count: 1 }))
				.sort((a, b) => a.session_id.localeCompare(b.session_id)),
		);
		expect(await snapshot()).toEqual(before);
		// Remove the just-below-threshold fixture before the later run.
		await env.DB.prepare('DELETE FROM records WHERE entity = ? AND id NOT IN (?, ?)')
			.bind('session', sessions[0]!.id, sessions[1]!.id)
			.run();
		const beforeRepeat = await snapshot();
		await cron(now + 30 * minute - 1);
		expect(captured).toHaveLength(6);
		await cron(now + 30 * minute);
		expect(captured).toHaveLength(12);
		expect(
			(await state()).every((s) => s.sent_count === 2 && s.last_sent_at === now + 30 * minute),
		).toBe(true);
		expect(await snapshot()).toEqual(beforeRepeat);
		// The first run itself never wrote records either.
		expect(before.filter((r) => r.entity !== 'session')).toEqual(
			beforeRepeat.filter((r) => r.entity !== 'session'),
		);
	});

	it('never repeats a once-only reminder and never records a session without subscriptions', async () => {
		const { sessions, cookie } = await seed(1, 0);
		await cron();
		expect(await state()).toEqual([]);
		expect((await subscribe(cookie)).status).toBe(204);
		const before = await snapshot();
		await cron();
		await cron(now + 24 * 60 * minute);
		expect(captured).toHaveLength(1);
		expect(await state()).toEqual([
			{ session_id: sessions[0]!.id, last_sent_at: now, sent_count: 1 },
		]);
		expect(await snapshot()).toEqual(before);
	});
	it('delivers and records a reminder for a 2,000-character Chinese work item name', async () => {
		const { sessions, workId } = await seed();
		await env.DB.prepare(
			"UPDATE records SET data = json_set(data, '$.name', ?) WHERE entity = 'work_item' AND id = ?",
		)
			.bind('库'.repeat(2000), workId)
			.run();
		const before = await snapshot();
		await cron();
		expect(captured).toHaveLength(1);
		expect((await payload(captured[0]!)).notification.body).toBe(
			`${'库'.repeat(80)}… has been running for 4h 00m.`,
		);
		expect(await state()).toEqual([
			{ session_id: sessions[0]!.id, last_sent_at: now, sent_count: 1 },
		]);
		expect(await snapshot()).toEqual(before);
	});

	it.each([404, 410])(
		'deletes an expired subscription on %s and does not use it for later sessions',
		async (status) => {
			await seed(2, 2);
			vi.mocked(fetch).mockImplementation(async (input, init) => {
				const req = new Request(input, init);
				captured.push(req);
				return new Response(null, { status: req.url === endpoint ? status : 201 });
			});
			await cron();
			expect(captured).toHaveLength(3);
			expect(
				(await env.DB.prepare('SELECT endpoint FROM push_subscriptions').all()).results,
			).toEqual([{ endpoint: 'https://push.example/subscriptions/1' }]);
			expect(await state()).toHaveLength(2);
		},
	);

	it('does not send to revoked devices and purges their subscription rows', async () => {
		const { cookie } = await seed();
		expect((await request(`auth/devices/${deviceA}`, 'DELETE', undefined, cookie)).status).toBe(
			204,
		);
		await cron();
		expect(captured).toHaveLength(0);
		expect(await state()).toEqual([]);
		expect((await env.DB.prepare('SELECT * FROM push_subscriptions').all()).results).toEqual([]);
	});

	it.each([
		'disabled',
		'non-reminding',
		'missing-setting',
		'deleted-setting',
		'deleted-type',
	] as const)('sends nothing for %s', async (reason) => {
		const { sessions } = await seed();
		if (reason === 'disabled')
			await store('setting', {
				id: 'reminder',
				value: { enabled: false, threshold_min: 240, repeat_min: null },
			});
		if (reason === 'non-reminding')
			await store('session', { ...sessions[0]!, type_id: PERSONAL_TYPE_ID });
		if (reason === 'missing-setting')
			await env.DB.prepare("DELETE FROM records WHERE entity = 'setting'").run();
		if (reason === 'deleted-setting')
			await env.DB.prepare("UPDATE records SET deleted_at = ? WHERE entity = 'setting'")
				.bind(now)
				.run();
		if (reason === 'deleted-type')
			await env.DB.prepare(
				"UPDATE records SET deleted_at = ? WHERE entity = 'activity_type' AND id = ?",
			)
				.bind(now, WORK_TYPE_ID)
				.run();
		const before = await snapshot();
		await cron();
		expect(captured).toHaveLength(0);
		expect(await state()).toEqual([]);
		expect(await snapshot()).toEqual(before);
	});

	it('defers whole sessions that do not fit, longest-running first, and sends them next run', async () => {
		const { sessions } = await seed(14, 3);
		const before = await snapshot();
		await cron();
		expect(captured).toHaveLength(39);
		expect(captured.length).toBeLessThanOrEqual(MAX_REMINDER_SENDS);
		expect(await state()).toHaveLength(13);
		expect(
			await env.DB.prepare('SELECT * FROM reminder_state WHERE session_id = ?')
				.bind(sessions[0]!.id)
				.first(),
		).toBeNull();
		expect((await payload(captured[0]!)).notification.navigate).toBe(`/?check=${sessions[13]!.id}`);
		await cron(now + 5 * minute);
		expect(captured).toHaveLength(42);
		expect(await state()).toHaveLength(14);
		expect(await snapshot()).toEqual(before);
	});

	it('sends only to the first 40 subscriptions for an oversized first session, records it, and warns', async () => {
		const { sessions } = await seed(2, 41);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await cron();
		expect(captured).toHaveLength(40);
		expect(captured.some((req) => req.url.endsWith('/40'))).toBe(false);
		expect(await state()).toEqual([
			{ session_id: sessions[1]!.id, last_sent_at: now, sent_count: 1 },
		]);
		expect(warn).toHaveBeenCalledOnce();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('first 40'), {
			sessionId: sessions[1]!.id,
		});
	});

	it.each(['network', '503'] as const)(
		'keeps a session due after a transient %s failure',
		async (failure) => {
			await seed();
			const log = vi.spyOn(console, 'error').mockImplementation(() => {});
			if (failure === 'network') vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
			else vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
			await cron();
			expect(await state()).toEqual([]);
			expect(log).toHaveBeenCalledOnce();
			await cron(now + 5 * minute);
			expect(await state()).toHaveLength(1);
		},
	);
	it('records a partial success so a healthy device is not notified again with repeats off', async () => {
		const { sessions } = await seed(1, 2);
		const before = await snapshot();
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			const req = new Request(input, init);
			captured.push(req);
			return new Response(null, { status: req.url === endpoint ? 201 : 503 });
		});
		await cron();
		expect(captured).toHaveLength(2);
		expect(log).toHaveBeenCalledOnce();
		expect(await state()).toEqual([
			{ session_id: sessions[0]!.id, last_sent_at: now, sent_count: 1 },
		]);
		await cron(now + 5 * minute);
		expect(captured).toHaveLength(2);
		expect(await snapshot()).toEqual(before);
	});
	it('retries the next run when all subscriptions fail transiently', async () => {
		const { sessions } = await seed(1, 2);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		let failing = true;
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			captured.push(new Request(input, init));
			return new Response(null, { status: failing ? 503 : 201 });
		});
		await cron();
		expect(captured).toHaveLength(2);
		expect(await state()).toEqual([]);
		failing = false;
		await cron(now + 5 * minute);
		expect(captured).toHaveLength(4);
		expect(await state()).toEqual([
			{ session_id: sessions[0]!.id, last_sent_at: now + 5 * minute, sent_count: 1 },
		]);
	});
	it.each([404, 410])(
		'does not record a reminder when every subscription returns %s',
		async (status) => {
			await seed(1, 2);
			vi.mocked(fetch).mockImplementation(async (input, init) => {
				captured.push(new Request(input, init));
				return new Response(null, { status });
			});
			await cron();
			expect(captured).toHaveLength(2);
			expect(await state()).toEqual([]);
			expect((await env.DB.prepare('SELECT * FROM push_subscriptions').all()).results).toEqual([]);
		},
	);
	it.each([
		['string', 'invalid'],
		['number', 240],
		['malformed object', { enabled: true, threshold_min: '240', repeat_min: null }],
	] as const)('defaults to reminders off for a stored %s setting value', async (_label, value) => {
		await seed();
		await store('setting', { id: 'reminder', value });
		const before = await snapshot();
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(cron()).resolves.toBeUndefined();
		expect(captured).toHaveLength(0);
		expect(await state()).toEqual([]);
		expect(log).not.toHaveBeenCalled();
		expect(await snapshot()).toEqual(before);
	});

	it('roughly times a cron run with five due sessions and three subscriptions', async () => {
		await seed(5, 3);
		const start = performance.now();
		await cron();
		const elapsed = performance.now() - start;
		expect(captured).toHaveLength(15);
		expect(await state()).toHaveLength(5);
		console.log(
			`reminder cron, workerd, 5 sessions × 3 subscriptions: ${elapsed.toFixed(2)} ms elapsed (rough CPU upper-bound proxy, includes local D1/WebCrypto waits; not deployed CPU telemetry)`,
		);
	});
});

describe('Web Push encryption and VAPID', () => {
	it('decrypts the generated aes128gcm record and verifies the ES256 signature and claims', async () => {
		await seed();
		await cron();
		const sent = captured[0]!;
		expect(sent.method).toBe('POST');
		expect(sent.redirect).toBe('manual');
		expect(sent.headers.get('Content-Encoding')).toBe('aes128gcm');
		expect(sent.headers.get('TTL')).toBe('3600');
		expect(sent.headers.get('Urgency')).toBe('normal');
		expect((await payload(sent)).notification.title).toBe('Still working?');
		const match = /^vapid t=([^,]+), k=(.+)$/.exec(sent.headers.get('Authorization')!)!;
		expect(match[2]).toBe(vapid.publicKey);
		const [header, claims, signature] = match[1]!.split('.') as [string, string, string];
		expect(JSON.parse(new TextDecoder().decode(decode64(header)))).toEqual({
			typ: 'JWT',
			alg: 'ES256',
		});
		const jwt = JSON.parse(new TextDecoder().decode(decode64(claims)));
		expect(jwt).toEqual({ aud: 'https://push.example', sub: origin, exp: now / 1000 + 12 * 3600 });
		expect(jwt.exp).toBeLessThanOrEqual(now / 1000 + 24 * 3600);
		const publicKey = await crypto.subtle.importKey(
			'raw',
			decode64(match[2]!),
			{ name: 'ECDSA', namedCurve: 'P-256' },
			false,
			['verify'],
		);
		expect(
			await crypto.subtle.verify(
				{ name: 'ECDSA', hash: 'SHA-256' },
				publicKey,
				decode64(signature),
				new TextEncoder().encode(`${header}.${claims}`),
			),
		).toBe(true);
		expect(decode64(signature)).toHaveLength(64);
	});
	it('uses fresh encryption keys/salts and rejects tampering or the wrong auth secret', async () => {
		const one = await encryptWebPush('修复洗手台', receiver.keys);
		const two = await encryptWebPush('修复洗手台', receiver.keys);
		expect(one.slice(0, 16)).not.toEqual(two.slice(0, 16));
		expect(one.slice(21, 86)).not.toEqual(two.slice(21, 86));
		expect(new DataView(one.buffer).getUint32(16)).toBe(4096);
		expect(await decryptPush(one.buffer, receiver)).toBe('修复洗手台');
		const corrupted = one.slice();
		corrupted[corrupted.length - 1]! ^= 1;
		await expect(decryptPush(corrupted.buffer, receiver)).rejects.toThrow();
		await expect(
			decryptPush(two.buffer, { ...receiver, auth: new Uint8Array(16) }),
		).rejects.toThrow();
	});
	it('accepts the single-record payload limit and rejects larger UTF-8 payloads', async () => {
		const encrypted = await encryptWebPush('a'.repeat(3993), receiver.keys);
		expect(encrypted).toHaveLength(4096);
		expect(await decryptPush(encrypted.buffer, receiver)).toBe('a'.repeat(3993));
		await expect(encryptWebPush('库'.repeat(1332), receiver.keys)).rejects.toThrow(RangeError);
	});
});
