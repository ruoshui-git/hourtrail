import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { TEST_ACCOUNT_KEY, acquireCloud, releaseCloud, resetAuthLockout } from './helpers/auth';

// Fail a stuck action in 15 s rather than letting it consume the 180 s test budget.
test.use({ actionTimeout: 15_000 });

test('sign in, link and revoke devices, preserve local recording, and sign out', async ({
	browser,
	browserName,
	baseURL,
}) => {
	test.setTimeout(180_000);
	// The Worker sets a Secure __Host- cookie. WebKit does not reliably accept Secure cookies on the local HTTP test origin.
	test.skip(
		browserName !== 'chromium',
		'Signed-in cloud steps require Chromium Secure-cookie support on http://127.0.0.1.',
	);
	await acquireCloud();
	// The local D1 can hold devices from earlier runs (a reused server, retries), so names that
	// assertions look up must be unique to this run.
	const run = Math.random().toString(36).slice(2, 6);
	const second = `Second device ${run}`;
	const third = `Third device ${run}`;
	const contextA = await browser.newContext({
		baseURL,
		timezoneId: 'America/New_York',
		locale: 'en-US',
	});
	const contextB = await browser.newContext({
		baseURL,
		timezoneId: 'America/New_York',
		locale: 'en-US',
	});
	const contextC = await browser.newContext({
		baseURL,
		timezoneId: 'America/New_York',
		locale: 'en-US',
	});
	const a = await contextA.newPage();
	const b = await contextB.newPage();
	const c = await contextC.newPage();
	try {
		await a.goto('/settings/cloud');
		await expect(
			a.getByText('On this device only. Sign in to back up and sync your records.'),
		).toBeVisible();
		await a.getByLabel('Device name').fill('第1寺院的手机');
		await captureCloudState(a, 'cloud-signed-out');
		const initialCount = await countSessions(a);
		await a.getByLabel('Account key').fill(TEST_ACCOUNT_KEY.toLowerCase().replace(/-/g, ' '));
		await a.getByLabel('Device name').fill('第1寺院的手机');
		await a.getByRole('button', { name: 'Sign in' }).click();
		await expect(a.getByText('Signed in as 第1寺院的手机')).toBeVisible();
		await expect(a.getByText('This device')).toBeVisible();
		await a.reload();
		await expect(a.getByText('Signed in as 第1寺院的手机')).toBeVisible();
		await a.evaluate(async () => {
			await navigator.serviceWorker.ready;
			if (!navigator.serviceWorker.controller) {
				await new Promise<void>((resolve) =>
					navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
						once: true,
					}),
				);
			}
		});
		await a.context().setOffline(true);
		await a.reload();
		await expect(a.getByText('Signed in as 第1寺院的手机')).toBeVisible();
		await a.goto('/');
		await a.getByRole('button', { name: 'Start' }).click();
		await expect(a.getByRole('button', { name: 'Stop' })).toBeEnabled();
		await a.getByRole('button', { name: 'Stop' }).click();
		await a.context().setOffline(false);

		await a.goto('/');
		await expect(a.getByRole('button', { name: 'Start' })).toBeEnabled();
		await a.getByRole('button', { name: 'Start' }).click();
		await expect(a.getByRole('button', { name: 'Stop' })).toBeEnabled();
		await a.getByRole('button', { name: 'Stop' }).click();

		await a.goto('/settings/cloud');
		await a.getByRole('button', { name: 'Link a device' }).click();
		await expect(a.getByLabel('Link QR code')).toBeVisible();
		await expect(a.locator('.code')).toHaveText(/[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}/);
		const link = await a.locator('.url').textContent();
		expect(link).toContain('/link#');
		await a.goto('/settings/cloud');
		await expect(a.getByRole('dialog', { name: 'Link a device' })).toHaveCount(0);
		await b.goto(link!);
		await expect(b).toHaveURL(/\/link$/);
		await expect(b.getByRole('heading', { name: 'Link this device' })).toBeVisible();
		await b.getByLabel('Device name').fill('第1寺院的手机');
		await captureCloudState(b, 'cloud-link-prefilled');
		await b.getByLabel('Device name').fill(second);
		await b.getByRole('button', { name: 'Link this device' }).click();
		await expect(b.getByText(`Signed in as ${second}`)).toBeVisible();
		await b.goto(link!);
		await expect(b.getByText(`This device is already signed in as ${second}.`)).toBeVisible();
		await expect(b).toHaveURL(/\/link$/);
		await b.goto('/settings/cloud');
		await c.goto(link!);
		await c.getByLabel('Device name').fill(third);
		await c.getByRole('button', { name: 'Link this device' }).click();
		await expect(
			c.getByText('That code is not valid. Codes work once, for five minutes.'),
		).toBeVisible();
		await a.bringToFront();
		await a.getByRole('button', { name: 'Refresh devices' }).click();
		await expect(a.getByText(second)).toBeVisible();
		await captureCloudState(a, 'cloud-two-devices');
		await a.getByRole('button', { name: 'Link a device' }).click();
		await expect(a.getByLabel('Link QR code')).toBeVisible();
		await captureCloudState(a, 'cloud-link-sheet');
		await a.goto('/settings/cloud');
		await a.getByRole('button', { name: 'Revoke' }).click();
		await expect(a.getByText(`Revoke ${second}?`)).toBeVisible();
		await a.getByRole('button', { name: 'Revoke', exact: true }).last().click();
		await a.goto('/settings/cloud');
		await expect(a.getByText(second)).toHaveCount(0);
		await b.reload();
		await expect(
			b.getByText('You were signed out. Sign in again to back up your records.'),
		).toBeVisible();

		const beforeSignOut = await countSessions(a);
		await a.getByRole('button', { name: 'Sign out' }).click();
		await expect(
			a.getByText(
				'Sign out of this device? Your records stay here. New changes stay on this device until you sign in again.',
			),
		).toBeVisible();
		await a.getByRole('button', { name: 'Sign out', exact: true }).last().click();
		await expect(
			a.getByText('On this device only. Sign in to back up and sync your records.'),
		).toBeVisible();
		const afterSignOut = await countSessions(a);
		expect(afterSignOut).toBe(beforeSignOut);
		await a.goto('/');
		// A rare run (about 2 in 11) waited out the whole test timeout here; wait for the
		// exact button first so a recurrence fails fast with a clear location.
		await expect(a.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
		await a.getByRole('button', { name: 'Start', exact: true }).dispatchEvent('click');
		await expect(a.getByRole('button', { name: 'Stop' })).toBeEnabled();
		await a.getByRole('button', { name: 'Stop', exact: true }).dispatchEvent('click');
		await expect(a.getByText('Not tracking')).toBeVisible();
		expect(await countSessions(a)).toBe(initialCount + 3);

		await a.goto('/settings/cloud');
		await a.getByLabel('Account key').fill('wrong key');
		await a.getByRole('button', { name: 'Sign in' }).click();
		await expect(a.getByText('That account key does not match.')).toBeVisible();
		// Wait for each attempt to finish so every click sends a request (five failures in all).
		for (let i = 0; i < 4; i++) {
			await expect(a.getByRole('button', { name: 'Sign in' })).toBeEnabled();
			await a.getByRole('button', { name: 'Sign in' }).click();
		}
		await expect(a.getByRole('button', { name: 'Sign in' })).toBeEnabled();
		await a.getByRole('button', { name: 'Sign in' }).click();
		await expect(a.getByText('Too many attempts. Try again in 15 minutes.')).toBeVisible();
		await a.getByLabel('Device name').fill('第1寺院的手机');
		await captureCloudState(a, 'cloud-lockout');
	} finally {
		await resetAuthLockout();
		await contextA.close();
		await contextB.close();
		await contextC.close();
		releaseCloud();
	}
});

async function captureCloudState(page: Page, name: string) {
	const directory = process.env.HT_RUN_DIR
		? join(process.env.HT_RUN_DIR, 'shots')
		: 'test-results/shots';
	await mkdir(directory, { recursive: true });
	await page.evaluate(() => {
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
	});
	for (const [label, width, height] of [
		['phone', 390, 844],
		['desktop', 1280, 800],
	] as const) {
		await page.setViewportSize({ width, height });
		for (const theme of ['light', 'dark'] as const) {
			await page.evaluate((value) => {
				document.documentElement.dataset.theme = value;
			}, theme);
			await page.screenshot({
				path: join(directory, `${name}-${label}-${theme}.png`),
				fullPage: false,
				animations: 'disabled',
			});
		}
	}
	await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
}

async function countSessions(page: Page) {
	return page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const count = await new Promise<number>((resolve, reject) => {
			const query = db.transaction('session', 'readonly').objectStore('session').count();
			query.onsuccess = () => resolve(query.result);
			query.onerror = () => reject(query.error);
		});
		db.close();
		return count;
	});
}
