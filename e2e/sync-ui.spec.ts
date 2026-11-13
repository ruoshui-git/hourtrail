import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { TEST_ACCOUNT_KEY, acquireCloud, releaseCloud } from './helpers/auth';
import { createSession, localSyncState } from './helpers/sync';

test.use({ actionTimeout: 15_000 });

// Signed-in tests share the one test account; take the cloud lock (see e2e/helpers/auth.ts).
// Release only a lock this file took, so a skipped run never frees another worker's lock.
let holdsCloud = false;
test.afterEach(() => {
	if (holdsCloud) releaseCloud();
	holdsCloud = false;
});

test('shows sync details, pending markers, and the device clock caution', async ({
	browserName,
	page,
}) => {
	test.skip(browserName !== 'chromium', 'Signed-in sync UI needs Chromium Secure-cookie support.');
	await acquireCloud();
	holdsCloud = true;
	test.setTimeout(120_000);
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	const run = Math.random().toString(36).slice(2, 7);
	const shots = process.env.HT_RUN_DIR ? join(process.env.HT_RUN_DIR, 'shots') : undefined;
	async function capture(name: string) {
		if (!shots) return;
		await mkdir(shots, { recursive: true });
		for (const [width, height, theme] of [
			[390, 844, 'light'],
			[390, 844, 'dark'],
			[1280, 800, 'light'],
			[1280, 800, 'dark'],
		] as const) {
			await page.setViewportSize({ width, height });
			await page.evaluate(
				(value) => document.documentElement.setAttribute('data-theme', value),
				theme,
			);
			await page.screenshot({ path: join(shots, `sync-${name}-${width}-${theme}.png`) });
		}
		// The steps below use the phone layout, where the badge sits on Home's date line.
		await page.setViewportSize({ width: 390, height: 844 });
		await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
	}
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	const badge = page.locator('.date-line button');
	await expect(badge).toBeVisible();
	await badge.click();
	await expect(page.getByText('Sign in to back up and sync your records.')).toBeVisible();
	await page.getByRole('link', { name: 'Cloud and devices' }).click();
	await page.getByLabel('Account key').fill(TEST_ACCOUNT_KEY);
	await page.getByLabel('Device name').fill(`Sync UI ${run}`);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByText(`Signed in as Sync UI ${run}`)).toBeVisible();

	await page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const tx = db.transaction('local', 'readwrite');
		tx.objectStore('local').put({ key: 'clock_offset_ms', value: 3 * 60_000 });
		tx.objectStore('local').put({
			key: 'sync_rejected',
			value: [
				{
					mutation_id: 'rejected-demo',
					entity: 'session',
					record_id: 'rejected-demo-record',
					reason: 'The session was changed on another device.',
					at: Date.now(),
				},
			],
		});
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		db.close();
	});
	await page.context().setOffline(true);
	await page.reload();
	await page.goto('/');
	await page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const tx = db.transaction('local', 'readwrite');
		tx.objectStore('local').put({ key: 'clock_offset_ms', value: 3 * 60_000 });
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		db.close();
	});
	await page.reload();
	await expect(
		page.getByText(
			"This device's clock is 3 minutes behind. Sessions started or stopped now are marked for review.",
		),
	).toBeVisible();
	await capture('home-offline-clock-caution');
	await page.locator('.date-line button').click();
	await expect(page.getByText('Not accepted by the cloud')).toBeVisible();
	await expect(
		page.getByText(/Session edit, .*: The session was changed on another device\./),
	).toBeVisible();
	await capture('details-rejected');
	await page.getByRole('button', { name: 'Copy details' }).click();
	await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
	await expect
		.poll(() => page.evaluate(() => navigator.clipboard.readText()))
		.toContain('The session was changed on another device.');
	await page.getByRole('button', { name: 'Close' }).click();

	await createSession(page, { name: `Pending ${run}`, note: 'Pending UI row' });
	await page.reload();
	await expect(page.getByLabel('Not backed up yet').first()).toBeVisible();
	await capture('home-pending');
	await page.goto('/history');
	await expect(page.getByLabel('Not backed up yet').first()).toBeVisible();
	await capture('history-pending');
	await page.goto('/items');
	await expect(page.getByLabel('Not backed up yet').first()).toBeVisible();
	await page.goto('/');
	await expect(page.locator('.date-line button')).toHaveAccessibleName(/Offline/);

	await page.context().setOffline(false);
	await expect
		.poll(async () => (await localSyncState(page)).outbox.length, { timeout: 30_000 })
		.toBe(0);
	await page.goto('/');
	await expect(page.getByLabel('Not backed up yet')).toHaveCount(0);
	await expect(page.locator('.date-line button')).toHaveAccessibleName('Backed up');
	// Desktop: the badge moves to the sidebar footer and is not repeated on Home.
	await page.setViewportSize({ width: 1280, height: 800 });
	await expect(page.locator('.date-line button')).toBeHidden();
	await expect(page.getByRole('button', { name: 'Backed up' })).toHaveCount(1);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/history');
	await expect(page.getByLabel('Not backed up yet')).toHaveCount(0);
	await page.goto('/items');
	await expect(page.getByLabel('Not backed up yet')).toHaveCount(0);
	await page.goto('/');
	await capture('home-synced-sidebar');
	await page.locator('.date-line button').click();
	await expect(page.getByText('Not accepted by the cloud')).toBeVisible();
	await page.getByRole('button', { name: 'Close' }).click();
});
