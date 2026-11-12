import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const shots = process.env.HT_RUN_DIR ? join(process.env.HT_RUN_DIR, 'shots') : 'shots';

async function placeId(page: Page, name: string) {
	return page.evaluate(
		(wanted) =>
			new Promise<string>((resolve, reject) => {
				const open = indexedDB.open('hourtrail');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const request = open.result.transaction('place').objectStore('place').getAll();
					request.onerror = () => reject(request.error);
					request.onsuccess = () => {
						const place = request.result.find((row) => row.name === wanted);
						open.result.close();
						if (place) resolve(place.id);
						else reject(new Error(`Place not found: ${wanted}`));
					};
				};
			}),
		name,
	);
}

async function assignSessionPlace(page: Page, place: string) {
	return page.evaluate(
		(placeId) =>
			new Promise<string>((resolve, reject) => {
				const open = indexedDB.open('hourtrail');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					const tx = db.transaction('session', 'readwrite');
					const store = tx.objectStore('session');
					const request = store.getAll();
					let id = '';
					request.onerror = () => reject(request.error);
					request.onsuccess = () => {
						const session = request.result.find((row) => row.deleted_at === null);
						if (!session) {
							reject(new Error('No session to assign'));
							return;
						}
						id = session.id;
						session.place_id = placeId;
						store.put(session);
					};
					tx.oncomplete = () => {
						db.close();
						resolve(id);
					};
					tx.onerror = () => reject(tx.error);
				};
			}),
		place,
	);
}

async function readPlaceSession(page: Page, sessionId: string) {
	return page.evaluate(
		(id) =>
			new Promise<string | null>((resolve, reject) => {
				const open = indexedDB.open('hourtrail');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					const request = db.transaction('session').objectStore('session').get(id);
					request.onerror = () => reject(request.error);
					request.onsuccess = () => {
						db.close();
						resolve(request.result?.place_id ?? null);
					};
				};
			}),
		sessionId,
	);
}

test('manage saved places, merge with Undo, archive, and persist', async ({
	page,
	context,
}, info) => {
	await page.addInitScript(() => localStorage.setItem('hourtrail-install-hint-dismissed', 'true'));
	await context.grantPermissions(['geolocation']);
	await context.setGeolocation({ latitude: 45.123, longitude: -73.456, accuracy: 35 });
	await page.goto('/settings/places');
	await page.getByRole('button', { name: 'Add place' }).click();
	await page.getByLabel('Name').fill('第1寺院');
	await page.getByRole('button', { name: 'Use my current location' }).click();
	await expect(page.getByText('Current location accuracy ±35 m.')).toBeVisible();
	await page.getByRole('button', { name: 'Add place' }).last().click();
	await expect(page.getByText('第1寺院')).toBeVisible();
	await page.getByRole('button', { name: 'Options for 第1寺院' }).click();
	await page.getByRole('menuitem', { name: 'Edit' }).click();
	await page.getByLabel('Radius').fill('150');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('dialog')).toBeHidden();
	await expect(page.getByText('Radius 150 m')).toBeVisible();

	const project = info.project.name;
	const screenshotPrefix = project === 'webkit-iphone' ? 'phone-light' : 'desktop-dark';
	if (project === 'webkit-iphone') await page.setViewportSize({ width: 390, height: 844 });
	else {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.emulateMedia({ colorScheme: 'dark' });
	}
	await mkdir(shots, { recursive: true });
	await page.screenshot({
		path: join(shots, `places-page-${screenshotPrefix}.png`),
		fullPage: true,
	});
	await page.getByRole('main').getByRole('button', { name: 'Add place' }).click();
	await expect(page.getByRole('dialog', { name: 'Add place' })).toBeVisible();
	await page.waitForTimeout(300);
	await page.screenshot({ path: join(shots, `places-sheet-${screenshotPrefix}.png`) });
	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByRole('dialog')).toBeHidden();

	await page.getByRole('main').getByRole('button', { name: 'Add place' }).click();
	await page.getByLabel('Name').fill('第一寺院');
	await page.getByLabel('Latitude').fill('45.124');
	await page.getByLabel('Longitude').fill('-73.457');
	await page.getByRole('button', { name: 'Add place' }).last().click();
	await expect(page.getByText('第一寺院')).toBeVisible();
	const duplicateId = await placeId(page, '第一寺院');

	await page.goto('/');
	await page
		.getByRole('textbox', { name: 'Search or name a work item' })
		.fill('Place merge session');
	await page.getByRole('button', { name: 'Start “Place merge session”' }).click();
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
	const sessionId = await assignSessionPlace(page, duplicateId);

	await page.goto('/settings/places');
	await page.getByRole('button', { name: 'Options for 第一寺院' }).click();
	await page.getByRole('menuitem', { name: 'Merge into…' }).click();
	await page.getByRole('button', { name: '第1寺院', exact: true }).click();
	await expect(page.getByText('Merged into 第1寺院')).toBeVisible();
	const targetId = await placeId(page, '第1寺院');
	await expect.poll(() => readPlaceSession(page, sessionId)).toBe(targetId);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => readPlaceSession(page, sessionId)).toBe(duplicateId);
	await page.getByRole('button', { name: 'Options for 第一寺院' }).click();
	await page.getByRole('menuitem', { name: 'Archive' }).click();
	await page.getByRole('button', { name: /Archived/ }).click();
	const archivedPlaces = page.getByRole('list', { name: 'Archived places' });
	await expect(archivedPlaces.getByText('第一寺院')).toBeVisible();
	await archivedPlaces.getByRole('button', { name: 'Restore' }).click();
	await expect(page.getByText('第一寺院')).toBeVisible();
	await page.reload();
	await expect(page.getByText('第一寺院')).toBeVisible();
	await expect(page.getByText('第1寺院')).toBeVisible();
});
