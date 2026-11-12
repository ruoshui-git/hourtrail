import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function dismissInstallHint(page: Page) {
	const notNow = page.getByRole('button', { name: 'Not now' });
	await notNow.waitFor({ state: 'visible', timeout: 2000 }).catch(() => undefined);
	if (await notNow.isVisible().catch(() => false)) await notNow.click();
}

test('Home starts a recent item without opening an entry form', async ({ page }) => {
	await page.goto('/');
	await dismissInstallHint(page);
	const field = page.getByRole('textbox', { name: 'Search or name a work item' });
	await field.fill('Existing task');
	await page.getByRole('button', { name: 'Start “Existing task”' }).click();
	await expect(page.getByRole('button', { name: 'Existing task', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Stop' }).click();
	await expect(page.getByRole('heading', { name: 'Recent' })).toBeVisible();
	await page.getByRole('button', { name: 'Start Existing task' }).click();
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Name this session' })).toHaveCount(0);
});

test('Home names an untitled session and Stop Undo resumes it', async ({ page }) => {
	await page.goto('/');
	await dismissInstallHint(page);
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	const name = page.getByRole('textbox', { name: 'Name this session' });
	await name.fill('修复洗手台');
	await name.press('Enter');
	await expect(page.getByRole('button', { name: '修复洗手台', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Stop' }).click();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
});

test('double tapping Start and reloading preserve one running session', async ({ page }) => {
	await page.goto('/');
	await dismissInstallHint(page);
	const start = page.getByRole('button', { name: 'Start', exact: true });
	await start.dblclick();
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
});

test('restarting an item makes a second independent session', async ({ page }) => {
	await page.clock.install({ time: new Date('2026-11-12T04:00:00-05:00') });
	await page.goto('/');
	await dismissInstallHint(page);
	const search = page.getByRole('textbox', { name: 'Search or name a work item' });
	await search.fill('Inventory');
	await page.getByRole('button', { name: 'Start “Inventory”' }).click();
	await page.clock.fastForward('03:00:00');
	await page.getByRole('button', { name: 'Stop' }).click();
	await expect(page.getByText(/Stopped at .*3h 00m/)).toBeVisible();
	await page.clock.fastForward('02:00:00');
	await page.getByRole('button', { name: 'Start Inventory' }).click();
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
	await expect(page.getByText('3h 00m work')).toBeVisible();
	const sessions = await page.evaluate(
		() =>
			new Promise<{ start_at: number; end_at: number | null; work_item_id: string | null }[]>(
				(resolve, reject) => {
					const open = indexedDB.open('hourtrail');
					open.onerror = () => reject(open.error);
					open.onsuccess = () => {
						const request = open.result.transaction('session').objectStore('session').getAll();
						request.onerror = () => reject(request.error);
						request.onsuccess = () => resolve(request.result);
					};
				},
			),
	);
	expect(sessions).toHaveLength(2);
	expect(Math.abs(sessions[0]!.end_at! - sessions[0]!.start_at - 3 * 60 * 60_000)).toBeLessThan(
		60_000,
	);
	expect(Math.abs(sessions[1]!.start_at - sessions[0]!.start_at - 5 * 60 * 60_000)).toBeLessThan(
		60_000,
	);
	expect(sessions[0]!.work_item_id).toBe(sessions[1]!.work_item_id);
});
