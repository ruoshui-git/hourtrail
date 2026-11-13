import { isUuid, type DeviceInfo } from '@hourtrail/core';
import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from './env';
import { ApiError, errorResponse } from './errors';

export type Device = Omit<DeviceInfo, 'current'>;
type StoredDevice = Device & {
	token_hash: string;
	token_issued_at: number;
	revoked_at: number | null;
};
const COOKIE = '__Host-ht';
const COOKIE_ATTRIBUTES = 'Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=';
const TEN_MINUTES = 10 * 60 * 1000;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function equalDigests(left: string, right: string): boolean {
	if (left.length !== right.length) return false;
	let difference = 0;
	for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
	return difference === 0;
}

export function sessionCookie(c: Context<AppEnv>, value: string): void {
	c.header('Set-Cookie', `${COOKIE}=${value}; ${COOKIE_ATTRIBUTES}34560000`);
}

export function clearSessionCookie(c: Context<AppEnv>): void {
	c.header('Set-Cookie', `${COOKIE}=; ${COOKIE_ATTRIBUTES}0`);
}

export const requireDevice: MiddlewareHandler<AppEnv> = async (c, next) => {
	const cookies = (c.req.header('Cookie') ?? '').split(';').map((part) => part.trim());
	const values = cookies.filter((part) => part.startsWith(`${COOKIE}=`));
	const value = values.length === 1 ? values[0]!.slice(COOKIE.length + 1) : '';
	const [id, token] = value.split('.');
	const reject = () => {
		const response = errorResponse(new ApiError(401, 'unauthorized', 'Please sign in again.'));
		response.headers.set('Set-Cookie', `${COOKIE}=; ${COOKIE_ATTRIBUTES}0`);
		return response;
	};
	if (
		!id ||
		!isUuid(id) ||
		!token ||
		!/^[A-Za-z0-9_-]{43}$/.test(token) ||
		value.split('.').length !== 2
	) {
		return reject();
	}
	const stored = await c.env.DB.prepare('SELECT * FROM devices WHERE id = ?')
		.bind(id)
		.first<StoredDevice>();
	if (
		!stored ||
		stored.revoked_at !== null ||
		!equalDigests(await sha256(token), stored.token_hash)
	) {
		return reject();
	}
	const now = Date.now();
	const seen = now - stored.last_seen_at > TEN_MINUTES;
	const refresh = now - stored.token_issued_at > THIRTY_DAYS;
	if (seen || refresh) {
		await c.env.DB.prepare(
			`UPDATE devices SET
			last_seen_at = MAX(last_seen_at, ?), token_issued_at = MAX(token_issued_at, ?)
			WHERE id = ? AND token_hash = ? AND revoked_at IS NULL`,
		)
			.bind(
				seen ? now : stored.last_seen_at,
				refresh ? now : stored.token_issued_at,
				id,
				stored.token_hash,
			)
			.run();
	}
	if (refresh) sessionCookie(c, value);
	c.set('device', {
		id: stored.id,
		name: stored.name,
		created_at: stored.created_at,
		last_seen_at: seen ? now : stored.last_seen_at,
	});
	await next();
};

export async function checkLockout(c: Context<AppEnv>): Promise<void> {
	const row = await c.env.DB.prepare("SELECT value FROM meta WHERE key = 'auth_lockout'").first<{
		value: string;
	}>();
	const lockedUntil = row ? (JSON.parse(row.value) as { locked_until: number }).locked_until : 0;
	if (Date.now() < lockedUntil) {
		const retry = Math.ceil((lockedUntil - Date.now()) / 1000);
		throw new ApiError(429, 'locked', 'Too many attempts. Try again later.', {
			retry_after_s: retry,
		});
	}
}

export async function countFailure(c: Context<AppEnv>): Promise<void> {
	// Compute from the current row inside SQLite: concurrent failures cannot lose increments.
	await c.env.DB.prepare(
		`INSERT INTO meta (key, value)
		VALUES ('auth_lockout', json_object('failures', 1, 'level', 0, 'locked_until', 0))
		ON CONFLICT(key) DO UPDATE SET value = json_object(
			'failures', CASE WHEN json_extract(value, '$.failures') >= 4 THEN 0 ELSE json_extract(value, '$.failures') + 1 END,
			'level', json_extract(value, '$.level') + CASE WHEN json_extract(value, '$.failures') >= 4 THEN 1 ELSE 0 END,
			'locked_until', CASE WHEN json_extract(value, '$.failures') >= 4
				THEN ?1 + MIN(86400000, 900000 * (1 << MIN(7, json_extract(value, '$.level'))))
				ELSE json_extract(value, '$.locked_until') END
		)
		WHERE json_extract(value, '$.locked_until') <= ?1`,
	)
		// Failures from requests that passed checkLockout before a concurrent request set the
		// lock are not counted, so a burst cannot escalate the lock past its first level.
		.bind(Date.now())
		.run();
}

export async function enrollDevice(c: Context<AppEnv>, id: string, name: string): Promise<Device> {
	const now = Date.now();
	const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
	const results = await c.env.DB.batch<Device>([
		c.env.DB.prepare(
			`INSERT INTO devices (id, name, token_hash, token_issued_at, created_at, last_seen_at)
			VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET name = excluded.name, token_hash = excluded.token_hash,
			token_issued_at = excluded.token_issued_at, last_seen_at = excluded.last_seen_at, revoked_at = NULL
			RETURNING id, name, created_at, last_seen_at`,
		).bind(id, name, await sha256(token), now, now, now),
		c.env.DB.prepare(`INSERT INTO meta (key, value)
			VALUES ('auth_lockout', '{"failures":0,"level":0,"locked_until":0}')
			ON CONFLICT(key) DO UPDATE SET value = excluded.value`),
	]);
	sessionCookie(c, `${id}.${token}`);
	return results[0]!.results[0]!;
}
