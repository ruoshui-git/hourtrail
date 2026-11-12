import { expect, test, type Page } from '@playwright/test';
import { clearSessions, openHome, readRecords, seed } from './helpers/acceptance';

async function startItem(page: Page) {
	await page.getByRole('textbox', { name: 'Search or name a work item' }).fill('库存管理系统开发');
	await page.getByRole('button', { name: '库存管理系统开发', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
}

test('a running session survives reload and elapsed time comes from its timestamp', async ({
	page,
}) => {
	await page.clock.install({ time: new Date('2026-11-12T10:00:00-05:00') });
	await seed(page, 'idle');
	await clearSessions(page);
	await openHome(page);
	await startItem(page);
	const startAt = (await readRecords(page)).session[0]!.start_at;
	await page.clock.fastForward('00:05:00');
	await page.reload();
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
	await expect(page.getByText('5m work')).toBeVisible();
	expect((await readRecords(page)).session[0]!.start_at).toBe(startAt);
});

test('closing the tab and opening another page in the same context keeps the session', async ({
	page,
	context,
}) => {
	await seed(page, 'idle');
	await clearSessions(page);
	await openHome(page);
	await startItem(page);
	const startAt = (await readRecords(page)).session[0]!.start_at;
	await page.close();
	const reopened = await context.newPage();
	await reopened.goto('/');
	await expect(reopened.getByRole('button', { name: 'Stop' })).toBeVisible();
	expect((await readRecords(reopened)).session[0]!.start_at).toBe(startAt);
});

test('a cold start after service worker unregister keeps IndexedDB data', async ({ page }) => {
	await seed(page, 'idle');
	await clearSessions(page);
	await openHome(page);
	await startItem(page);
	await expect
		.poll(
			() =>
				page.evaluate(async () =>
					Boolean((await navigator.serviceWorker.getRegistration())?.active),
				),
			{ timeout: 15_000 },
		)
		.toBe(true);
	await page.reload();
	await expect
		.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
			timeout: 15_000,
		})
		.toBe(true);
	const before = await readRecords(page);
	expect(before.session).toHaveLength(1);
	const unregistered = await page.evaluate(async () => {
		const registrations = await navigator.serviceWorker.getRegistrations();
		return Promise.all(registrations.map((registration) => registration.unregister()));
	});
	expect(unregistered.length).toBeGreaterThan(0);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
	expect((await readRecords(page)).session).toEqual(before.session);
});

test('offline start and stop persist sessions locally', async ({ page, context }) => {
	await seed(page, 'idle');
	await clearSessions(page);
	await openHome(page);
	await context.setOffline(true);
	await startItem(page);
	await page.getByRole('button', { name: 'Stop' }).click();
	await expect.poll(async () => (await readRecords(page)).session).toHaveLength(1);
	const session = (await readRecords(page)).session[0]!;
	expect(session.end_at).not.toBeNull();
	expect(session.work_item_id).not.toBeNull();
});
