import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { dismissInstallHint, openHome } from './helpers/acceptance';
import { acquireCloud, releaseCloud, TEST_ACCOUNT_KEY } from './helpers/auth';
import { localSyncState, signIn } from './helpers/sync';

test.use({ actionTimeout: 15_000 });

type FixRow = {
	id: string;
	lat: number;
	lng: number;
	accuracy_m: number;
	deleted_at: number | null;
};

async function store<T>(page: Page, name: string): Promise<T[]> {
	return page.evaluate(
		(name) =>
			new Promise<T[]>((resolve, reject) => {
				const request = indexedDB.open('hourtrail');
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const database = request.result;
					const query = database.transaction(name).objectStore(name).getAll();
					query.onsuccess = () => {
						database.close();
						resolve(query.result as T[]);
					};
					query.onerror = () => reject(query.error);
				};
			}),
		name,
	);
}

async function waitSaved(page: Page) {
	await expect.poll(async () => (await localSyncState(page)).outbox.length).toBe(0);
}

async function screenshotVariants(page: Page, name: string) {
	if (!process.env.HT_RUN_DIR) return;
	const directory = join(process.env.HT_RUN_DIR, 'shots');
	await mkdir(directory, { recursive: true });
	for (const [width, height, size] of [
		[390, 844, 'phone'],
		[1280, 800, 'desktop'],
	] as const) {
		await page.setViewportSize({ width, height });
		for (const theme of ['light', 'dark'] as const) {
			await page.emulateMedia({ colorScheme: theme });
			await page.screenshot({
				path: join(directory, `privacy-cloud-${name}-${size}-${theme}.png`),
				animations: 'disabled',
			});
		}
	}
}

test('raw coordinate privacy controls and cloud erasure work across signed-in devices', async ({
	browser,
	browserName,
	baseURL,
}) => {
	test.setTimeout(240_000);
	test.skip(browserName !== 'chromium', 'Signed-in flows require Chromium Secure-cookie support.');
	await acquireCloud();
	const suffix = Math.random().toString(36).slice(2, 7);
	const contextA = await browser.newContext({ baseURL, timezoneId: 'America/Halifax' });
	const contextB = await browser.newContext({ baseURL, timezoneId: 'America/Halifax' });
	const a = await contextA.newPage();
	const b = await contextB.newPage();
	try {
		await signIn(a, `Privacy A ${suffix}`);
		await signIn(b, `Privacy B ${suffix}`);
		await contextA.grantPermissions(['geolocation']);
		await contextA.setGeolocation({ latitude: 45.5, longitude: -63.5, accuracy: 8 });

		const pushes: { mutations?: { entity: string }[] }[] = [];
		a.on('request', (request) => {
			if (request.url().includes('/api/sync/push'))
				pushes.push(request.postDataJSON() as { mutations?: { entity: string }[] });
		});
		await openHome(a);
		await a.goto('/settings/privacy');
		await dismissInstallHint(a);
		await a.getByRole('switch', { name: 'Capture location on Start and Stop' }).check();
		await expect(
			a.getByRole('switch', { name: 'Capture location on Start and Stop' }),
		).toBeChecked();
		await a.goto('/');
		await a.getByRole('button', { name: 'Start', exact: true }).click();
		await expect.poll(async () => (await store<unknown>(a, 'local_fix')).length).toBeGreaterThan(0);
		await waitSaved(a);
		expect(
			pushes
				.flatMap((batch) => batch.mutations ?? [])
				.some((mutation) => mutation.entity === 'session_fix'),
		).toBe(false);
		await a.goto('/settings/privacy');
		await screenshotVariants(a, 'raw-off');

		await a.getByRole('switch', { name: 'Back up raw coordinates' }).check();
		await expect
			.poll(async () => (await store<FixRow>(a, 'session_fix')).length)
			.toBeGreaterThan(0);
		await expect.poll(async () => (await store<unknown>(a, 'local_fix')).length).toBe(0);
		await waitSaved(a);
		expect(
			pushes
				.flatMap((batch) => batch.mutations ?? [])
				.some((mutation) => mutation.entity === 'session_fix'),
		).toBe(true);
		await screenshotVariants(a, 'raw-on');
		await a.goto('/');
		await a.getByRole('button', { name: 'Stop' }).click();
		await a.getByRole('button', { name: 'Start', exact: true }).click();
		await expect
			.poll(
				async () =>
					(await store<FixRow>(a, 'session_fix')).filter((fix) => fix.deleted_at === null).length,
			)
			.toBeGreaterThan(1);
		await waitSaved(a);
		await b.reload();
		await expect
			.poll(async () =>
				(await store<FixRow>(b, 'session_fix')).some((fix) => fix.lat !== 0 && fix.lng !== 0),
			)
			.toBe(true);

		await a.goto('/settings/privacy');
		await a.getByRole('switch', { name: 'Back up raw coordinates' }).uncheck();
		await a.getByRole('button', { name: 'Delete raw coordinates from the cloud' }).click();
		await expect(a.getByRole('dialog')).toContainText('Delete raw coordinates from the cloud?');
		await a
			.getByRole('button', { name: 'Delete raw coordinates from the cloud', exact: true })
			.last()
			.click();
		await expect
			.poll(async () =>
				(await store<FixRow>(a, 'session_fix')).every(
					(fix) =>
						fix.deleted_at !== null && fix.lat === 0 && fix.lng === 0 && fix.accuracy_m === 0,
				),
			)
			.toBe(true);
		await expect
			.poll(async () =>
				(await store<FixRow>(a, 'local_fix')).some((fix) => fix.lat === 45.5 && fix.lng === -63.5),
			)
			.toBe(true);
		await waitSaved(a);
		await b.reload();
		await expect
			.poll(async () => (await store<FixRow>(b, 'session_fix')).length)
			.toBeGreaterThan(0);
		await expect
			.poll(async () =>
				(await store<FixRow>(b, 'session_fix')).every(
					(fix) =>
						fix.deleted_at !== null && fix.lat === 0 && fix.lng === 0 && fix.accuracy_m === 0,
				),
			)
			.toBe(true);

		await a.goto('/settings/cloud');
		await a.getByRole('button', { name: 'Erase cloud data', exact: true }).click();
		await screenshotVariants(a, 'erase-empty');
		await a.getByLabel('Account key').fill('incorrect-key');
		await a.getByRole('button', { name: 'Erase cloud data', exact: true }).last().click();
		await expect(a.getByText('That account key does not match.')).toBeVisible();
		await screenshotVariants(a, 'erase-wrong-key');
		await a.getByLabel('Account key').fill(TEST_ACCOUNT_KEY);
		await a.getByRole('button', { name: 'Erase cloud data', exact: true }).last().click();
		await expect(a.getByRole('status')).toHaveText('Cloud data erased.');
		expect((await localSyncState(a)).sessions.length).toBeGreaterThan(0);
		await b.goto('/settings/cloud');
		await expect(
			b.getByText('You were signed out. Sign in again to back up your records.'),
		).toBeVisible();
		expect((await localSyncState(b)).sessions.length).toBeGreaterThan(0);
	} finally {
		await contextA.close();
		await contextB.close();
		releaseCloud();
	}
});

test('also erase this device deletes its local database and reloads to a fresh start', async ({
	browser,
	browserName,
	baseURL,
}) => {
	test.setTimeout(120_000);
	test.skip(browserName !== 'chromium', 'Signed-in flows require Chromium Secure-cookie support.');
	await acquireCloud();
	const page = await browser.newPage({ baseURL });
	try {
		await signIn(page, 'Erase this device');
		await openHome(page);
		await page.goto('/settings/cloud');
		await page.getByRole('button', { name: 'Erase cloud data', exact: true }).click();
		await page.getByRole('checkbox', { name: 'Also erase this device' }).check();
		await page.getByLabel('Account key').fill(TEST_ACCOUNT_KEY);
		await page.getByRole('button', { name: 'Erase cloud data', exact: true }).last().click();
		await expect(page).toHaveURL(/\/$/);
		await expect.poll(async () => (await localSyncState(page)).sessions.length).toBe(0);
	} finally {
		await page.close();
		releaseCloud();
	}
});
