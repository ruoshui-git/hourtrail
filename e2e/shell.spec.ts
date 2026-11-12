import { expect, test } from '@playwright/test';

// The app shell boots under the production CSP with no console errors, and the
// install metadata is in place (DESIGN_SYSTEM/SPEC "PWA behaviour").
test('shell boots without CSP or console errors', async ({ page }) => {
	const errors: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	page.on('pageerror', (e) => errors.push(e.message));
	const res = await page.goto('/');
	expect(res?.headers()['content-security-policy']).toContain("script-src 'self' 'sha256-");
	await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
	expect(errors).toEqual([]);
});

test('deep links fall back to the app shell', async ({ page }) => {
	const res = await page.goto('/history');
	expect(res?.status()).toBe(200);
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('manifest and icons are served', async ({ request }) => {
	const manifest = await request.get('/manifest.webmanifest');
	expect(manifest.ok()).toBe(true);
	const m = await manifest.json();
	expect(m).toMatchObject({ name: 'Hourtrail', display: 'standalone', start_url: '/', id: '/' });
	for (const icon of m.icons as { src: string }[]) {
		expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
	}
	expect((await request.get('/icons/apple-touch-icon-180.png')).ok()).toBe(true);
});

test('API responses are never cached', async ({ request }) => {
	const res = await request.get('/api/health');
	expect(res.headers()['cache-control']).toBe('no-store');
	expect(await res.json()).toMatchObject({ ok: true });
});
