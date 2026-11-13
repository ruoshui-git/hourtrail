import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './env';
import { ApiError } from './errors';
import { apiHeaders } from './security';

export const requestId: MiddlewareHandler<AppEnv> = async (c, next) => {
	c.set('requestId', crypto.randomUUID());
	await next();
	c.header('X-Request-Id', c.var.requestId);
};

export const apiHeadersMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
	await next();
	apiHeaders().forEach((value, name) => c.header(name, value));
};

const changingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const sameOriginJson: MiddlewareHandler<AppEnv> = async (c, next) => {
	if (changingMethods.has(c.req.method)) {
		if (c.req.header('Origin') !== new URL(c.req.url).origin) {
			throw new ApiError(403, 'forbidden_origin', 'The request origin is not allowed.');
		}
		const mediaType = c.req.header('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase();
		if (c.req.raw.body !== null && mediaType !== 'application/json') {
			throw new ApiError(415, 'unsupported_media_type', 'The request body must be JSON.');
		}
	}
	await next();
};

const MAX_BODY_BYTES = 1024 * 1024;
const tooLarge = () => new ApiError(413, 'payload_too_large', 'The request body is too large.');

export const bodyLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
	if (Number(c.req.header('Content-Length')) > MAX_BODY_BYTES) throw tooLarge();
	const body = c.req.raw.body;
	if (body) {
		// Count actual bytes even when Content-Length is present. Buffer at most 1 MiB
		// so downstream handlers can read the body normally after the guard finishes.
		const reader = body.getReader();
		let buffer = new Uint8Array(0);
		let size = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			const offset = size;
			size += value.byteLength;
			if (size > MAX_BODY_BYTES) {
				void reader.cancel().catch(() => undefined);
				throw tooLarge();
			}
			if (size > buffer.byteLength) {
				const grown = new Uint8Array(
					Math.min(MAX_BODY_BYTES, Math.max(size, buffer.byteLength * 2)),
				);
				grown.set(buffer.subarray(0, offset));
				buffer = grown;
			}
			buffer.set(value, offset);
		}
		c.req.raw = new Request(c.req.raw, { body: size ? buffer.subarray(0, size) : null });
	}
	await next();
};
