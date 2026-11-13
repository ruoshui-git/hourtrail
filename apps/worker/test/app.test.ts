import { Hono, type Handler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app';
import type { AppEnv } from '../src/env';
import { ApiError } from '../src/errors';
import { parseJson, parseQuery } from '../src/validate';
import { expectApiHeaders, expectError, origin } from './helpers';

const jsonHeaders = { Origin: origin, 'Content-Type': 'application/json; charset=utf-8' };

function stream(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(chunk);
			controller.close();
		},
	});
}

describe('request guards', () => {
	it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
		'rejects absent, foreign and non-exact origins for %s before the handler',
		async (method) => {
			const app = createApp();
			const handler = vi.fn((c: Parameters<AppEnvHandler>[0]) => c.json({ ok: true }));
			app.on(method, '/api/test', handler);
			for (const header of [
				undefined,
				'https://foreign.example',
				'null',
				`${origin}/`,
				'http://hourtrail.example',
			]) {
				await expectError(
					await app.request(`${origin}/api/test`, {
						method,
						headers: header ? { Origin: header } : {},
					}),
					403,
					'forbidden_origin',
				);
			}
			expect(handler).not.toHaveBeenCalled();
		},
	);

	it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
		'requires JSON for nonempty %s bodies and accepts parameters',
		async (method) => {
			const app = createApp();
			const handler = vi.fn(async (c: Parameters<AppEnvHandler>[0]) => c.json(await c.req.json()));
			app.on(method, '/api/test', handler);
			for (const contentType of [
				undefined,
				'text/plain',
				'application/jsonp',
				'application/problem+json',
			]) {
				await expectError(
					await app.request(`${origin}/api/test`, {
						method,
						headers: { Origin: origin, ...(contentType ? { 'Content-Type': contentType } : {}) },
						body: '{}',
					}),
					415,
					'unsupported_media_type',
				);
			}
			expect(handler).not.toHaveBeenCalled();
			const response = await app.request(`${origin}/api/test`, {
				method,
				headers: jsonHeaders,
				body: '{"name":"库存管理系统开发"}',
			});
			expect(response.status).toBe(200);
			expectApiHeaders(response);
			expect(await response.json()).toEqual({ name: '库存管理系统开发' });
			expect(handler).toHaveBeenCalledOnce();
		},
	);

	it.each(['POST', 'DELETE'])('allows %s without a body or Content-Type', async (method) => {
		const app = createApp();
		app.on(method, '/api/test', (c) => c.json({ ok: true }));
		const requests: RequestInit[] = [
			{ headers: { Origin: origin } },
			{ headers: { Origin: origin, 'Content-Length': '0' } },
			{ headers: { Origin: origin }, body: stream() },
		];
		for (const init of requests) {
			const response = await app.request(`${origin}/api/test`, { method, ...init });
			expect(response.status).toBe(200);
			expectApiHeaders(response);
			expect(await response.json()).toEqual({ ok: true });
		}
	});

	it('rejects oversized Content-Length before reading or invoking the handler', async () => {
		const app = createApp();
		const handler = vi.fn((c: Parameters<AppEnvHandler>[0]) => c.json({ ok: true }));
		app.post('/api/test', handler);
		await expectError(
			await app.request(`${origin}/api/test`, {
				method: 'POST',
				headers: { ...jsonHeaders, 'Content-Length': String(1024 * 1024 + 1) },
			}),
			413,
			'payload_too_large',
		);
		expect(handler).not.toHaveBeenCalled();
	});

	it.each([undefined, '1'])(
		'rejects streamed overflow even with Content-Length %s and cancels reading',
		async (length) => {
			const app = createApp();
			const handler = vi.fn((c: Parameters<AppEnvHandler>[0]) => c.json({ ok: true }));
			app.post('/api/test', handler);
			const cancel = vi.fn();
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new Uint8Array(1024 * 1024));
					controller.enqueue(new Uint8Array(1));
				},
				cancel,
			});
			await expectError(
				await app.request(`${origin}/api/test`, {
					method: 'POST',
					headers: { ...jsonHeaders, ...(length ? { 'Content-Length': length } : {}) },
					body,
				}),
				413,
				'payload_too_large',
			);
			expect(handler).not.toHaveBeenCalled();
			expect(cancel).toHaveBeenCalledOnce();
		},
	);

	it('allows exactly 1 MiB, preserving a streamed body for the handler', async () => {
		const app = createApp();
		app.post('/api/test', async (c) => c.json({ bytes: (await c.req.arrayBuffer()).byteLength }));
		const response = await app.request(`${origin}/api/test`, {
			method: 'POST',
			headers: jsonHeaders,
			body: stream(new Uint8Array(1024 * 512), new Uint8Array(1024 * 512)),
		});
		expect(response.status).toBe(200);
		expectApiHeaders(response);
		expect(await response.json()).toEqual({ bytes: 1024 * 1024 });
	});

	it('counts UTF-8 bytes rather than characters', async () => {
		const app = createApp();
		app.post('/api/test', (c) => c.json({ ok: true }));
		await expectError(
			await app.request(`${origin}/api/test`, {
				method: 'POST',
				headers: jsonHeaders,
				body: JSON.stringify('库'.repeat(400_000)),
			}),
			413,
			'payload_too_large',
		);
	});
});

type AppEnvHandler = Handler<AppEnv>;

describe('validation helpers', () => {
	function appWithValidation() {
		const app = createApp();
		app.post('/api/json', async (c) => c.json(await parseJson(c, z.object({ name: z.string() }))));
		app.get('/api/query', (c) =>
			c.json(parseQuery(c, z.object({ limit: z.coerce.number().int().min(1) }))),
		);
		app.post('/api/issues', async (c) =>
			c.json(await parseJson(c, z.object({ names: z.array(z.string()) }))),
		);
		return app;
	}

	it('round-trips Chinese JSON through parseJson', async () => {
		const response = await appWithValidation().request(`${origin}/api/json`, {
			method: 'POST',
			headers: jsonHeaders,
			body: JSON.stringify({ name: '库存管理系统开发' }),
		});
		expectApiHeaders(response);
		expect(await response.json()).toEqual({ name: '库存管理系统开发' });
	});

	it('returns the required message for malformed JSON', async () => {
		const body = await expectError(
			await appWithValidation().request(`${origin}/api/json`, {
				method: 'POST',
				headers: jsonHeaders,
				body: '{',
			}),
			400,
			'invalid_request',
		);
		expect(body.error.message).toBe('The request body is not valid JSON.');
	});

	it('returns at most 20 issues with dotted string paths', async () => {
		const body = await expectError(
			await appWithValidation().request(`${origin}/api/issues`, {
				method: 'POST',
				headers: jsonHeaders,
				body: JSON.stringify({ names: Array(30).fill(1) }),
			}),
			400,
			'invalid_request',
		);
		const issues = body.error.details?.issues as { path: string; message: string }[];
		expect(issues).toHaveLength(20);
		expect(issues.map((issue) => issue.path)).toEqual(
			Array.from({ length: 20 }, (_, i) => `names.${i}`),
		);
		for (const issue of issues) expect(issue.message).toEqual(expect.any(String));
	});

	it('parses valid queries and reports invalid queries with issue paths', async () => {
		const app = appWithValidation();
		const valid = await app.request(`${origin}/api/query?limit=5`);
		expect(valid.status).toBe(200);
		expectApiHeaders(valid);
		expect(await valid.json()).toEqual({ limit: 5 });
		for (const query of ['', '?limit=abc', '?limit=0']) {
			const body = await expectError(
				await app.request(`${origin}/api/query${query}`),
				400,
				'invalid_request',
			);
			expect(body.error.details?.issues).toEqual([{ path: 'limit', message: expect.any(String) }]);
		}
	});
});

describe('error handling and extensible routing', () => {
	it('logs unexpected errors with the request id and exposes no exception text', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			const app = createApp();
			const error = new Error('SELECT private_secret FROM devices; secret stack');
			app.get('/api/throw', () => {
				throw error;
			});
			const response = await app.request(`${origin}/api/throw`);
			const body = await expectError(response, 500, 'internal');
			expect(body).toEqual({ error: { code: 'internal', message: 'Something went wrong.' } });
			expect(log).toHaveBeenCalledWith('API request failed', {
				requestId: response.headers.get('X-Request-Id'),
				error,
			});
		} finally {
			log.mockRestore();
		}
	});

	it('preserves explicit ApiError details', async () => {
		const app = createApp();
		app.get('/api/locked', () => {
			throw new ApiError(429, 'locked', 'Please try again later.', { retry_after_s: 60 });
		});
		const body = await expectError(await app.request(`${origin}/api/locked`), 429, 'locked');
		expect(body.error.details).toEqual({ retry_after_s: 60 });
	});

	it.each([
		[400, 'invalid_request'],
		[401, 'unauthorized'],
		[403, 'forbidden_origin'],
		[404, 'not_found'],
		[405, 'method_not_allowed'],
		[413, 'payload_too_large'],
		[415, 'unsupported_media_type'],
		[429, 'locked'],
		[503, 'conflict_retry'],
	] as const)(
		'maps HTTPException %s without leaking its response or message',
		async (status, code) => {
			const app = createApp();
			app.get('/api/http', () => {
				throw new HTTPException(status, {
					message: 'private exception',
					res: new Response('private SQL', { status }),
				});
			});
			const body = await expectError(await app.request(`${origin}/api/http`), status, code);
			expect(JSON.stringify(body)).not.toContain('private');
		},
	);

	it('derives Allow for parameterized routes mounted after createApp', async () => {
		const app = createApp();
		const group = new Hono<AppEnv>();
		group.get('/:id', (c) => c.json({ id: c.req.param('id'), requestId: c.var.requestId }));
		group.delete('/:id', (c) => c.json({ ok: true }));
		app.route('/api/items', group);
		const response = await app.request(`${origin}/api/items/123`, { method: 'OPTIONS' });
		await expectError(response, 405, 'method_not_allowed');
		expect(response.headers.get('Allow')?.split(', ').sort()).toEqual(['DELETE', 'GET', 'HEAD']);
		const get = await app.request(`${origin}/api/items/123`);
		expectApiHeaders(get);
		expect(await get.json()).toEqual({ id: '123', requestId: get.headers.get('X-Request-Id') });
		await expectError(await app.request(`${origin}/api/items/123/extra`), 404, 'not_found');
	});

	it('applies the API header policy after a handler sets conflicting headers', async () => {
		const app = createApp();
		app.get('/api/headers', (c) => {
			c.header('Cache-Control', 'public, max-age=100');
			c.header('X-Request-Id', 'handler-provided');
			return c.json({ ok: true });
		});
		const response = await app.request(`${origin}/api/headers`);
		expectApiHeaders(response);
		await response.arrayBuffer();
	});
});
