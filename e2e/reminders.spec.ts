import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { TEST_ACCOUNT_KEY, acquireCloud, releaseCloud } from './helpers/auth';
import { seed } from './helpers/acceptance';

test.use({ actionTimeout: 15_000 });
test.setTimeout(180_000);
// Notifications and signed-in steps need Chromium (WebKit rejects the Secure cookie on the HTTP
// test origin), so the whole file runs there only.
test.skip(({ browserName }) => browserName !== 'chromium', 'Reminder coverage runs in Chromium.');

const BASE = new Date('2026-11-12T12:00:00-05:00');
type Row = Record<string, unknown>;

async function table<T>(page: Page, name: string): Promise<T[]> {
	return page.evaluate(async (store) => {
		const request = indexedDB.open('hourtrail');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		try {
			const query = db.transaction(store).objectStore(store).getAll();
			return await new Promise<T[]>((resolve, reject) => {
				query.onsuccess = () => resolve(query.result);
				query.onerror = () => reject(query.error);
			});
		} finally {
			db.close();
		}
	}, name);
}

async function prepareRunning(
	page: Page,
	options: { elapsedMin?: number; enabled?: boolean; remind?: boolean; thresholdMin?: number } = {},
) {
	await page.clock.install({ time: BASE });
	await seed(page, 'running');
	const rows = await table<Row>(page, 'session');
	const session = rows.find((row) => row.end_at === null)!;
	await page.evaluate(
		async ({ sessionId, startAt, enabled, remind, thresholdMin }) => {
			const request = indexedDB.open('hourtrail');
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			const getSession = db.transaction('session').objectStore('session').get(sessionId);
			const original = await new Promise<Row>((resolve, reject) => {
				getSession.onsuccess = () => resolve(getSession.result);
				getSession.onerror = () => reject(getSession.error);
			});
			const tx = db.transaction(['session', 'setting', 'activity_type'], 'readwrite');
			tx.objectStore('session').put({ ...original, start_at: startAt });
			const now = Date.now();
			tx.objectStore('setting').put({
				id: 'reminder',
				value: { enabled, threshold_min: thresholdMin, repeat_min: null },
				rev: 0,
				created_at: now,
				updated_at: now,
				updated_by: '',
				deleted_at: null,
			});
			const types = tx.objectStore('activity_type');
			const getWork = types.get('00000000-0000-7000-8000-000000000001');
			const work = await new Promise<Row>((resolve, reject) => {
				getWork.onsuccess = () => resolve(getWork.result);
				getWork.onerror = () => reject(getWork.error);
			});
			types.put({ ...work, remind });
			await new Promise<void>((resolve, reject) => {
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
				tx.onabort = () => reject(tx.error);
			});
			db.close();
		},
		{
			sessionId: session.id as string,
			startAt: BASE.getTime() - (options.elapsedMin ?? 75) * 60_000,
			enabled: options.enabled ?? true,
			remind: options.remind ?? true,
			thresholdMin: options.thresholdMin ?? 60,
		},
	);
	await page.goto('/');
}

async function dismissInstallHint(page: Page) {
	const hint = page.getByRole('button', { name: 'Not now' });
	if (await hint.isVisible().catch(() => false)) await hint.click();
}

async function saveReminder(page: Page, enabled: boolean, thresholdHours = 1) {
	await page.goto('/settings/reminders');
	const reminderSwitch = page.getByRole('switch', {
		name: 'Remind me about a session left running',
	});
	if ((await reminderSwitch.getAttribute('aria-checked')) !== String(enabled))
		await reminderSwitch.click();
	const after = page.getByLabel('After');
	await after.selectOption(String(thresholdHours * 60));
	await expect
		.poll(
			async () => (await table<Row>(page, 'setting')).find((row) => row.id === 'reminder')?.value,
		)
		.toEqual({ enabled, threshold_min: thresholdHours * 60, repeat_min: null });
}

function localInput(time: number) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/New_York',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(time);
	const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
	return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

test('settings write the reminder setting and per-type remind flags', async ({ page }) => {
	await page.goto('/settings/reminders');
	const main = page.getByRole('switch', { name: 'Remind me about a session left running' });
	await main.click();
	await expect
		.poll(
			async () => (await table<Row>(page, 'setting')).find((row) => row.id === 'reminder')?.value,
		)
		.toEqual({ enabled: true, threshold_min: 240, repeat_min: null });
	const work = page.getByRole('switch', { name: 'Work', exact: true });
	await work.click();
	await expect
		.poll(
			async () =>
				(await table<Row>(page, 'activity_type')).find(
					(row) => row.id === '00000000-0000-7000-8000-000000000001',
				)?.remind,
		)
		.toBe(false);
	await expect.poll(async () => (await table<Row>(page, 'outbox')).length).toBeGreaterThan(0);
});

test('Still working appears for check links and eligible opens, and respects reminder eligibility', async ({
	page,
}) => {
	await prepareRunning(page, { elapsedMin: 30, thresholdMin: 60 });
	await dismissInstallHint(page);
	await expect(page.getByRole('dialog', { name: 'Still working?' })).toHaveCount(0);
	const rows = await table<Row>(page, 'session');
	const id = rows.find((row) => row.end_at === null)!.id as string;
	await page.goto(`/?check=${id}`);
	await expect(page.getByRole('dialog', { name: 'Still working?' })).toBeVisible();
	await expect(page).toHaveURL('/');
	await page.getByRole('button', { name: 'Keep running' }).click();
	await page.clock.fastForward('00:31:00');
	await page.reload();
	await expect(page.getByRole('dialog', { name: 'Still working?' })).toHaveCount(0);

	await prepareRunning(page, { elapsedMin: 30, thresholdMin: 60, enabled: false });
	await expect(page.getByRole('dialog', { name: 'Still working?' })).toHaveCount(0);
	await saveReminder(page, true, 1);
	await page.clock.fastForward('00:31:00');
	await page.goto('/');
	await expect(page.getByRole('dialog', { name: 'Still working?' })).toBeVisible();

	await prepareRunning(page, { elapsedMin: 75, remind: false });
	await expect(page.getByRole('dialog', { name: 'Still working?' })).toHaveCount(0);
});

test('Stop now and Stop at validate and save the running session end', async ({ page }) => {
	await prepareRunning(page, { elapsedMin: 75 });
	await expect(page.getByRole('dialog', { name: 'Still working?' })).toBeVisible();
	await page.getByRole('button', { name: 'Stop at…' }).click();
	const end = page.getByLabel('End time');
	const session = (await table<Row>(page, 'session')).find((row) => row.end_at === null)!;
	const start = Number(session.start_at);
	await end.fill(localInput(start - 60_000));
	await page.getByRole('button', { name: 'Stop at…' }).last().click();
	await expect(page.getByText('Choose a time between the session start and now.')).toBeVisible();
	await end.fill(localInput(BASE.getTime() + 60_000));
	await page.getByRole('button', { name: 'Stop at…' }).last().click();
	await expect(page.getByText('Choose a time between the session start and now.')).toBeVisible();
	await end.fill(localInput(BASE.getTime() - 60_000));
	await page.getByRole('button', { name: 'Stop at…' }).last().click();
	await expect
		.poll(
			async () => (await table<Row>(page, 'session')).find((row) => row.id === session.id)?.end_at,
		)
		.not.toBeNull();

	await prepareRunning(page, { elapsedMin: 75 });
	await page.getByRole('button', { name: 'Stop now' }).click();
	await expect
		.poll(async () => (await table<Row>(page, 'session')).find((row) => row.end_at !== null))
		.toBeTruthy();
});

test('reminder screenshots for settings and the open Stop at sheet', async ({
	browser,
	baseURL,
}) => {
	const directory = process.env.HT_RUN_DIR ? join(process.env.HT_RUN_DIR, 'shots') : 'shots';
	await mkdir(directory, { recursive: true });
	await acquireCloud();
	try {
		for (const viewport of [
			{ width: 390, height: 844 },
			{ width: 1280, height: 800 },
		]) {
			for (const theme of ['light', 'dark'] as const) {
				const context = await browser.newContext({
					baseURL,
					viewport,
					timezoneId: 'America/New_York',
					locale: 'en-US',
				});
				await context.grantPermissions(['notifications']);
				const page = await context.newPage();
				await page.emulateMedia({ colorScheme: theme });
				await page.clock.install({ time: BASE });
				await page.goto('/settings/appearance');
				await page.getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light' }).click();
				await expect
					.poll(
						async () => (await table<Row>(page, 'local')).find((row) => row.key === 'theme')?.value,
					)
					.toBe(theme);
				await page.getByRole('link', { name: 'Settings', exact: true }).click();
				await page.getByRole('link', { name: 'Reminders', exact: true }).click();
				await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
				await expect
					.poll(() =>
						page.evaluate(() =>
							getComputedStyle(document.documentElement).getPropertyValue('--ht-paper').trim(),
						),
					)
					.toBe(theme === 'dark' ? '#111614' : '#f1f4f0');
				await page.screenshot({
					path: join(directory, `reminders-signed-out-${viewport.width}-${theme}.png`),
					fullPage: true,
				});
				await page.getByRole('link', { name: 'Settings', exact: true }).click();
				await page.getByRole('link', { name: 'Cloud and devices' }).click();
				await page.getByLabel('Account key').fill(TEST_ACCOUNT_KEY);
				await page.getByLabel('Device name').fill(`Reminder shots ${viewport.width} ${theme}`);
				await page.getByRole('button', { name: 'Sign in' }).click();
				await expect(page.getByText(/^Signed in as/)).toBeVisible();
				await page.getByRole('link', { name: 'Settings', exact: true }).click();
				await page.getByRole('link', { name: 'Reminders', exact: true }).click();
				await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
				await page.screenshot({
					path: join(directory, `reminders-off-${viewport.width}-${theme}.png`),
					fullPage: true,
				});
				const reminder = page.getByRole('switch', {
					name: 'Remind me about a session left running',
				});
				if ((await reminder.getAttribute('aria-checked')) !== 'true') await reminder.click();
				await expect
					.poll(
						async () =>
							(await table<Row>(page, 'setting')).find((row) => row.id === 'reminder')?.value,
					)
					.toEqual({ enabled: true, threshold_min: 240, repeat_min: null });
				await page.evaluate(async () => {
					const open = indexedDB.open('hourtrail');
					const db = await new Promise<IDBDatabase>((resolve, reject) => {
						open.onsuccess = () => resolve(open.result);
						open.onerror = () => reject(open.error);
					});
					const tx = db.transaction('local', 'readwrite');
					tx.objectStore('local').put({ key: 'push_state', value: true });
					await new Promise<void>((resolve, reject) => {
						tx.oncomplete = () => resolve();
						tx.onerror = () => reject(tx.error);
					});
					db.close();
				});
				await page.reload();
				await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
				await page.screenshot({
					path: join(directory, `reminders-on-${viewport.width}-${theme}.png`),
					fullPage: true,
				});
				await prepareRunning(page, { elapsedMin: 75 });
				await expect(page.getByRole('dialog', { name: 'Still working?' })).toBeVisible();
				await page.getByRole('button', { name: 'Stop at…' }).click();
				await page.screenshot({
					path: join(directory, `reminders-still-working-${viewport.width}-${theme}.png`),
					fullPage: true,
				});
				await context.close();
			}
		}
	} finally {
		releaseCloud();
	}
});
