import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { expectApiHeaders, expectError, origin } from './helpers';

describe('real Worker API routing', () => {
	it('serves health with full headers and a fresh request id', async () => {
		const before = Date.now();
		const first = await SELF.fetch(`${origin}/api/health`, {
			headers: { 'X-Request-Id': 'untrusted' },
		});
		expect(first.status).toBe(200);
		expectApiHeaders(first);
		const body = await first.json<{ ok: boolean; time: number }>();
		expect(body.ok).toBe(true);
		expect(body.time).toBeGreaterThanOrEqual(before);
		expect(body.time).toBeLessThanOrEqual(Date.now());
		const second = await SELF.fetch(`${origin}/api/health`);
		expectApiHeaders(second);
		expect(first.headers.get('X-Request-Id')).not.toBe(second.headers.get('X-Request-Id'));
		await second.arrayBuffer();
	});

	it.each(['/api', '/api/', '/api/nope', '/api/health/nope'])(
		'uses the error envelope and full headers for %s',
		async (path) => {
			const body = await expectError(await SELF.fetch(`${origin}${path}`), 404, 'not_found');
			expect(body.error.message).toBe('No such endpoint.');
		},
	);

	it('returns 405 and Allow for a known route, with implicit HEAD support', async () => {
		const response = await SELF.fetch(`${origin}/api/health`, { method: 'OPTIONS' });
		await expectError(response, 405, 'method_not_allowed');
		expect(response.headers.get('Allow')?.split(', ')).toEqual(['GET', 'HEAD']);
		const head = await SELF.fetch(`${origin}/api/health`, { method: 'HEAD' });
		expect(head.status).toBe(200);
		expectApiHeaders(head);
		expect(await head.text()).toBe('');
	});

	it('applies guards before resolving unknown paths or wrong methods', async () => {
		await expectError(
			await SELF.fetch(`${origin}/api/nope`, { method: 'POST' }),
			403,
			'forbidden_origin',
		);
		await expectError(
			await SELF.fetch(`${origin}/api/health`, {
				method: 'POST',
				headers: { Origin: origin },
				body: 'plain text',
			}),
			415,
			'unsupported_media_type',
		);
		await expectError(
			await SELF.fetch(`${origin}/api/nope`, {
				method: 'POST',
				headers: { Origin: origin, 'Content-Type': 'application/json' },
				body: 'x'.repeat(1024 * 1024 + 1),
			}),
			413,
			'payload_too_large',
		);
	});
});
