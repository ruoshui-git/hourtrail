import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, OfflineError } from './client';

const objectSchema = {
	parse(value: unknown): { ok: boolean } {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('ok' in value) ||
			typeof value.ok !== 'boolean'
		) {
			throw new TypeError('Expected an ok response.');
		}
		return { ok: value.ok };
	},
};
const unknownSchema = { parse: (value: unknown) => value };

afterEach(() => vi.unstubAllGlobals());

describe('apiFetch', () => {
	it('validates a successful JSON response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":true}')));
		await expect(apiFetch('/api/test', { schema: objectSchema })).resolves.toEqual({ ok: true });
	});
	it('parses a 401 API error', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response('{"error":{"code":"unauthorized","message":"Sign in."}}', { status: 401 }),
				),
		);
		const request = apiFetch('/api/test', { schema: unknownSchema });
		await expect(request).rejects.toBeInstanceOf(ApiError);
		await expect(request).rejects.toMatchObject({
			status: 401,
			code: 'unauthorized',
			message: 'Sign in.',
		});
	});
	it('uses internal for malformed error bodies', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 500 })));
		await expect(apiFetch('/api/test', { schema: unknownSchema })).rejects.toMatchObject({
			code: 'internal',
		});
	});
	it('maps network failures to OfflineError', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
		await expect(apiFetch('/api/test', { schema: unknownSchema })).rejects.toBeInstanceOf(
			OfflineError,
		);
	});
});
