import { describe, expect, it } from 'vitest';
import worker, { type Env } from './index';
import { contentSecurityPolicy } from './security';

const env = {
	ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
} as unknown as Env;

const call = (path: string, init?: RequestInit) =>
	worker.fetch(new Request(`https://hourtrail.example${path}`, init), env);

describe('worker', () => {
	it('answers /api/health with JSON, no-store and security headers', async () => {
		const res = await call('/api/health');
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ ok: true });
		expect(res.headers.get('Cache-Control')).toBe('no-store');
		expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
		expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
		expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
	});

	it('returns a JSON 404 for unknown API paths', async () => {
		const res = await call('/api/nope');
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({
			error: { code: 'not_found', message: 'No such endpoint.' },
		});
		expect(res.headers.get('Cache-Control')).toBe('no-store');
	});

	it('hands everything else to static assets', async () => {
		const res = await call('/history');
		expect(await res.text()).toBe('asset');
	});
});

describe('content security policy', () => {
	it('allows only self scripts plus the given hashes, never unsafe-inline scripts', () => {
		const csp = contentSecurityPolicy(['sha256-abc']);
		expect(csp).toContain("script-src 'self' 'sha256-abc'");
		expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
		expect(csp).toContain("connect-src 'self'");
		expect(csp).toContain("default-src 'self'");
	});
});
