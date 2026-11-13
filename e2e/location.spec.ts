import { expect, test, type Page } from '@playwright/test';
import { dismissInstallHint, openHome } from './helpers/acceptance';

const PLACE_ID = '019a0000-0000-7000-8000-000000000001';
type CapturedSession = { id: string; place_id: string | null; place_state: string };

async function seedPlace(
	page: Page,
	options: { id?: string; name?: string; lat?: number; lng?: number; radius?: number } = {},
) {
	await page.evaluate(
		async ({ id, name, lat, lng, radius }) => {
			const request = indexedDB.open('hourtrail');
			const database = await new Promise<IDBDatabase>((resolve, reject) => {
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			const now = Date.now();
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction('place', 'readwrite');
				transaction.objectStore('place').put({
					id,
					rev: 1,
					created_at: now,
					updated_at: now,
					updated_by: 'e2e',
					deleted_at: null,
					name,
					lat,
					lng,
					radius_m: radius,
					description: '',
					archived_at: null,
				});
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(transaction.error);
			});
			database.close();
		},
		{
			id: options.id ?? PLACE_ID,
			name: options.name ?? '第1寺院',
			lat: options.lat ?? 37.4219,
			lng: options.lng ?? -122.084,
			radius: options.radius ?? 100,
		},
	);
}

async function enableCapture(page: Page) {
	await page.goto('/settings/privacy');
	await dismissInstallHint(page);
	await page.getByRole('switch', { name: 'Capture location on Start and Stop' }).check();
	await expect(
		page.getByRole('switch', { name: 'Capture location on Start and Stop' }),
	).toBeChecked();
}

async function readSession(page: Page) {
	return page.evaluate(
		() =>
			new Promise<CapturedSession | undefined>((resolve, reject) => {
				const request = indexedDB.open('hourtrail');
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const query = request.result.transaction('session').objectStore('session').getAll();
					query.onsuccess = () => resolve(query.result.at(-1));
					query.onerror = () => reject(query.error);
				};
			}),
	);
}

test('a sure location match assigns the saved place after Start', async ({ page, context }) => {
	await context.grantPermissions(['geolocation']);
	await context.setGeolocation({ latitude: 37.4219, longitude: -122.084, accuracy: 10 });
	await openHome(page);
	await seedPlace(page);
	await enableCapture(page);
	await openHome(page);
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect.poll(async () => (await readSession(page))?.place_state).toBe('set');
	expect((await readSession(page)).place_id).toBe(PLACE_ID);
});

test('suggested locations can be confirmed', async ({ page, context }) => {
	await context.grantPermissions(['geolocation']);
	await context.setGeolocation({ latitude: 37.4219, longitude: -122.084, accuracy: 40 });
	await openHome(page);
	await seedPlace(page, { lat: 37.42221, radius: 25 });
	await enableCapture(page);
	await openHome(page);
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect(page.getByText('Near 第1寺院 (±40 m)?')).toBeVisible();
	await page.getByRole('button', { name: 'Confirm' }).click();
	expect((await readSession(page)).place_id).toBe(PLACE_ID);
});

test('ambiguous locations list candidates nearest first', async ({ page, context }) => {
	await context.grantPermissions(['geolocation']);
	await context.setGeolocation({ latitude: 37.4219, longitude: -122.084, accuracy: 30 });
	await openHome(page);
	await seedPlace(page, { lat: 37.4221, radius: 100 });
	await seedPlace(page, {
		id: '019a0000-0000-7000-8000-000000000002',
		name: '第3寺院',
		lat: 37.422,
		radius: 100,
	});
	await enableCapture(page);
	await openHome(page);
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect(page.getByRole('button', { name: '第3寺院', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: '第1寺院', exact: true })).toBeVisible();
	const candidates = await page.evaluate(
		() =>
			new Promise<string[]>((resolve) => {
				const request = indexedDB.open('hourtrail');
				request.onsuccess = () => {
					const query = request.result.transaction('session').objectStore('session').getAll();
					query.onsuccess = () => resolve(query.result.at(-1).place_candidates);
				};
			}),
	);
	expect(candidates).toEqual(['019a0000-0000-7000-8000-000000000002', PLACE_ID]);
});

test('unresolved location can be named from the captured fix', async ({ page, context }) => {
	await context.grantPermissions(['geolocation']);
	await context.setGeolocation({ latitude: 37.4219, longitude: -122.084, accuracy: 40 });
	await openHome(page);
	await enableCapture(page);
	await openHome(page);
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Name this place', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Name this place', exact: true }).click();
	await page.getByRole('textbox', { name: 'Place name' }).fill('第2寺院');
	await page.getByRole('button', { name: 'Save place' }).click();
	await expect.poll(async () => (await readSession(page))?.place_id).toBeTruthy();
});

test('a provider that never returns cannot delay Start or Stop', async ({ page }) => {
	await page.addInitScript(() => {
		let calls = 0;
		Object.defineProperty(window, '__geoCalls', { get: () => calls });
		Object.defineProperty(navigator, 'geolocation', {
			configurable: true,
			value: {
				watchPosition: () => {
					calls++;
					return 1;
				},
				clearWatch: () => {},
				getCurrentPosition: () => {
					calls++;
				},
			},
		});
	});
	await openHome(page);
	await page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		await new Promise<void>((resolve) => {
			request.onsuccess = () => {
				request.result
					.transaction('local', 'readwrite')
					.objectStore('local')
					.put({ key: 'capture_location', value: true });
				resolve();
			};
		});
	});
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
	expect(await readSession(page)).toBeTruthy();
	expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(
		1,
	);
	await page.getByRole('button', { name: 'Stop' }).click();
	await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
});

test('capture off makes no geolocation call', async ({ page }) => {
	await page.addInitScript(() => {
		let calls = 0;
		Object.defineProperty(window, '__geoCalls', { get: () => calls });
		Object.defineProperty(navigator, 'geolocation', {
			configurable: true,
			value: {
				watchPosition: () => {
					calls++;
					return 1;
				},
				clearWatch: () => {},
			},
		});
	});
	await openHome(page);
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
	expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(
		0,
	);
});

test('capture errors leave the session saved and unresolved', async ({ page }) => {
	await page.addInitScript(() =>
		Object.defineProperty(navigator, 'geolocation', {
			configurable: true,
			value: {
				watchPosition: (_success: unknown, error: (value: unknown) => void) => {
					setTimeout(() => error({ code: 1 }), 0);
					return 1;
				},
				clearWatch: () => {},
				getCurrentPosition: (_success: unknown, error: (value: unknown) => void) =>
					error({ code: 1 }),
			},
		}),
	);
	await openHome(page);
	await page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		await new Promise<void>((resolve) => {
			request.onsuccess = () => {
				request.result
					.transaction('local', 'readwrite')
					.objectStore('local')
					.put({ key: 'capture_location', value: true });
				resolve();
			};
		});
	});
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect.poll(async () => (await readSession(page))?.place_state).toBe('unresolved');
});

test('a geolocation timeout leaves the session saved and unresolved', async ({ page }) => {
	await page.addInitScript(() =>
		Object.defineProperty(navigator, 'geolocation', {
			configurable: true,
			value: {
				watchPosition: (_success: unknown, error: (value: unknown) => void) => {
					setTimeout(() => error({ code: 3 }), 0);
					return 1;
				},
				clearWatch: () => {},
			},
		}),
	);
	await openHome(page);
	await page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		await new Promise<void>((resolve) => {
			request.onsuccess = () => {
				request.result
					.transaction('local', 'readwrite')
					.objectStore('local')
					.put({ key: 'capture_location', value: true });
				resolve();
			};
		});
	});
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect.poll(async () => (await readSession(page))?.place_state).toBe('unresolved');
});

test('accuracy over 150 metres never matches a saved place', async ({ page }) => {
	await page.addInitScript(() =>
		Object.defineProperty(navigator, 'geolocation', {
			configurable: true,
			value: {
				watchPosition: (success: (position: unknown) => void, error: (value: unknown) => void) => {
					setTimeout(() => {
						success({
							coords: { latitude: 37.4219, longitude: -122.084, accuracy: 200 },
							timestamp: Date.now(),
						});
						setTimeout(() => error({ code: 3 }), 0);
					}, 0);
					return 1;
				},
				clearWatch: () => {},
				getCurrentPosition: (success: () => void) => success(),
			},
		}),
	);
	await openHome(page);
	await seedPlace(page);
	await enableCapture(page);
	await openHome(page);
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect.poll(async () => (await readSession(page))?.place_state).toBe('unresolved');
	expect((await readSession(page)).place_id).toBeNull();
	await expect(page.getByRole('region', { name: 'Place recognition' })).toHaveCount(0);
});

test('session editor removes raw coordinates but retains its assigned place', async ({
	page,
	context,
}) => {
	await context.grantPermissions(['geolocation']);
	await context.setGeolocation({ latitude: 37.4219, longitude: -122.084, accuracy: 10 });
	await openHome(page);
	await seedPlace(page);
	await enableCapture(page);
	await openHome(page);
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect.poll(async () => (await readSession(page))?.place_state).toBe('set');
	await page.getByRole('button', { name: 'Stop' }).click();
	await page.getByRole('button', { name: 'Add note' }).click();
	await expect(page.getByText('Near 第1寺院 (±10 m)')).toBeVisible();
	await page
		.getByRole('button', { name: 'Remove coordinates' })
		.evaluate((button) => (button as HTMLButtonElement).click());
	await expect
		.poll(async () =>
			page.evaluate(
				() =>
					new Promise<number>((resolve) => {
						const request = indexedDB.open('hourtrail');
						request.onsuccess = () => {
							const query = request.result
								.transaction('local_fix')
								.objectStore('local_fix')
								.getAll();
							query.onsuccess = () => resolve(query.result.length);
						};
					}),
			),
		)
		.toBe(0);
	expect((await readSession(page)).place_id).toBe(PLACE_ID);
	await page.goto('/settings/privacy');
	await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();
});
