import { env } from 'cloudflare:test';
import {
	newId,
	pushAckSchema,
	pullResponseSchema,
	WORK_TYPE_ID,
	type Batch,
	type Mutation,
	type Session,
} from '@hourtrail/core';
import { expect } from 'vitest';
import { createApp } from '../src/app';
import type { Env } from '../src/env';
import { TEST_ACCOUNT_KEY } from './auth-key';
import { expectApiHeaders, origin } from './helpers';

export const now = Date.UTC(2026, 10, 13, 12);
export const deviceA = '019a67c9-8000-7000-8000-000000000001';
export const deviceB = '019a67c9-8000-7000-8000-000000000002';
const app = createApp();

export function request(
	path: string,
	method = 'GET',
	body?: unknown,
	cookie?: string,
	bindings: Env = env,
) {
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
		bindings,
	);
}

export async function signedIn(device_id = deviceA): Promise<string> {
	const response = await request('auth/enroll', 'POST', {
		account_key: TEST_ACCOUNT_KEY,
		device_id,
		device_name: '第1寺院',
	});
	expect(response.status).toBe(201);
	await response.arrayBuffer();
	return response.headers.get('Set-Cookie')!.split(';')[0]!;
}

export function session(note = 'original'): Session {
	return {
		id: newId(now),
		rev: 0,
		created_at: now - 1000,
		updated_at: now - 1000,
		updated_by: deviceA,
		deleted_at: null,
		work_item_id: null,
		type_id: WORK_TYPE_ID,
		start_at: now - 1000,
		end_at: null,
		start_tz: 'America/Halifax',
		end_tz: null,
		note,
		source: 'live',
		place_id: null,
		place_state: 'none',
		place_candidates: [],
		origin_device_id: deviceA,
		flags: {},
	};
}

export function patch(
	id: string,
	from: string,
	to: string,
	device_id = deviceA,
	at = now + 100,
): Mutation {
	return {
		id: newId(now),
		entity: 'session',
		record_id: id,
		kind: 'patch',
		fields: { note: { from, to } },
		device_id,
		at,
	};
}

export function batch(mutations: Mutation[], device_id = deviceA): Batch {
	return { batch_id: newId(now), device_id, mutations };
}

export async function push(body: Batch, cookie: string, bindings: Env = env) {
	const response = await request('sync/push', 'POST', body, cookie, bindings);
	expect(response.status).toBe(200);
	expectApiHeaders(response);
	return pushAckSchema.parse(await response.json());
}

export async function pull(cookie: string, query = '', bindings: Env = env) {
	const response = await request(`sync/pull${query}`, 'GET', undefined, cookie, bindings);
	expect(response.status).toBe(200);
	expectApiHeaders(response);
	return pullResponseSchema.parse(await response.json());
}

export async function clearSync() {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM records'),
		env.DB.prepare('DELETE FROM sync_batches'),
	]);
}

export async function snapshot() {
	return (await env.DB.prepare('SELECT * FROM records ORDER BY entity, id').all()).results;
}

// Count executed D1 calls, excluding prepare/bind. Hooks run against the real DB
// so a test can insert a competing transaction precisely before the write.
export function proxiedDB(beforeWrite?: () => Promise<void>) {
	let calls = 0;
	const batches: string[][] = [];
	const raw = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
	const queries = new WeakMap<D1PreparedStatement, string>();
	function statement(target: D1PreparedStatement, query: string): D1PreparedStatement {
		const proxy = new Proxy(target, {
			get(target, property) {
				if (property === 'bind') {
					return (...values: unknown[]) => statement(target.bind(...values), query);
				}
				const value = Reflect.get(target, property);
				if (typeof value !== 'function') return value;
				return (...args: unknown[]) => {
					calls++;
					return Reflect.apply(value, target, args);
				};
			},
		});
		raw.set(proxy, target);
		queries.set(proxy, query);
		return proxy;
	}
	const db = new Proxy(env.DB, {
		get(target, property) {
			if (property === 'prepare') return (query: string) => statement(target.prepare(query), query);
			if (property === 'batch') {
				return async (statements: D1PreparedStatement[]) => {
					calls++;
					const sql = statements.map((s) => queries.get(s)!);
					batches.push(sql);
					if (sql[0]!.startsWith('INSERT INTO sync_batches')) await beforeWrite?.();
					return target.batch(statements.map((s) => raw.get(s)!));
				};
			}
			const value = Reflect.get(target, property);
			return typeof value === 'function' ? value.bind(target) : value;
		},
	});
	return { bindings: { ...env, DB: db }, calls: () => calls, batches };
}
