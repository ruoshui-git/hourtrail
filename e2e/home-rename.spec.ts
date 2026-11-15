import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

test.use({ actionTimeout: 15_000 });

type HomeState = {
	session: { id: string; work_item_id: string | null; end_at: number | null }[];
	work_item: { id: string; name: string; deleted_at: number | null; archived_at: number | null }[];
};

async function state(page: Page): Promise<HomeState> {
	return page.evaluate(
		() =>
			new Promise<HomeState>((resolve, reject) => {
				const open = indexedDB.open('hourtrail');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const tx = open.result.transaction(['session', 'work_item']);
					const sessions = tx.objectStore('session').getAll();
					const items = tx.objectStore('work_item').getAll();
					tx.onerror = () => reject(tx.error);
					tx.oncomplete = () => resolve({ session: sessions.result, work_item: items.result });
				};
			}),
	);
}

async function dismissInstallHint(page: Page) {
	const button = page.getByRole('button', { name: 'Not now' });
	await button.waitFor({ state: 'visible', timeout: 2000 }).catch(() => undefined);
	if (await button.isVisible().catch(() => false)) await button.click();
}

async function startNamedFromIdle(page: Page, name: string) {
	await page.getByRole('textbox', { name: 'Search or name a work item' }).fill(name);
	await page.getByRole('button', { name: `Start “${name}”` }).click();
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
}

test('Home renames only the current session and preserves Switch and untitled naming', async ({
	page,
}, testInfo) => {
	test.setTimeout(60_000);
	await page.goto('/');
	await dismissInstallHint(page);
	await startNamedFromIdle(page, '库存管理系统开发');
	await page.getByRole('button', { name: 'Stop' }).click();
	await expect(page.getByRole('button', { name: 'Start 库存管理系统开发' })).toBeVisible();

	await startNamedFromIdle(page, '修复洗手台');
	await page.getByRole('button', { name: 'Stop' }).click();
	await expect(page.getByRole('button', { name: 'Start 修复洗手台' })).toBeVisible();
	await page.getByRole('button', { name: 'Start 库存管理系统开发' }).click();
	await expect(
		page.getByRole('button', { name: 'Rename current session, 库存管理系统开发' }),
	).toBeVisible();

	const before = await state(page);
	const oldItem = before.work_item.find((item) => item.name === '库存管理系统开发')!;
	const previousSession = before.session.find(
		(session) => session.end_at !== null && session.work_item_id === oldItem.id,
	)!;
	const currentSession = before.session.find((session) => session.end_at === null)!;

	const shotsDir = process.env.HT_RUN_DIR ? join(process.env.HT_RUN_DIR, 'shots') : undefined;
	if (shotsDir && testInfo.project.name === 'chromium') {
		await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0, { timeout: 15_000 });
		await mkdir(shotsDir, { recursive: true });
		for (const [width, height] of [
			[390, 844],
			[1280, 800],
		]) {
			await page.setViewportSize({ width, height });
			for (const theme of ['light', 'dark'] as const) {
				await page.emulateMedia({ colorScheme: theme });
				const suffix = `${width}x${height}-${theme}`;
				await page.screenshot({ path: join(shotsDir, `home-rename-running-${suffix}.png`) });
				await page
					.getByRole('button', { name: 'Rename current session, 库存管理系统开发' })
					.click();
				await page.getByRole('textbox', { name: 'Name', exact: true }).fill('修复');
				await expect(page.getByRole('button', { name: '修复洗手台', exact: true })).toBeVisible();
				await page.screenshot({ path: join(shotsDir, `home-rename-suggestions-${suffix}.png`) });
				await page.getByRole('button', { name: 'Close' }).click();
				await page.waitForTimeout(300);
				await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
			}
		}
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.emulateMedia({ colorScheme: 'light' });
	}

	await page.getByRole('button', { name: 'Rename current session, 库存管理系统开发' }).click();
	const name = page.getByRole('textbox', { name: 'Name', exact: true });
	await expect(name).toHaveValue('库存管理系统开发');
	await expect(
		page.getByText('Changes this session only. Earlier sessions keep their name.'),
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await name.fill('   ');
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await name.fill('修复洗手台');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(
		page.getByRole('button', { name: 'Rename current session, 修复洗手台' }),
	).toBeVisible();
	await expect(page.getByText('Renamed to 修复洗手台.')).toBeVisible();
	await expect
		.poll(async () => {
			const data = await state(page);
			return data.session.find((session) => session.id === currentSession.id)?.work_item_id;
		})
		.toBe((await state(page)).work_item.find((item) => item.name === '修复洗手台')!.id);
	let after = await state(page);
	expect(after.session.find((session) => session.id === previousSession.id)?.work_item_id).toBe(
		oldItem.id,
	);
	expect(after.work_item.find((item) => item.id === oldItem.id)?.name).toBe('库存管理系统开发');

	await page.getByRole('button', { name: 'Undo' }).last().click();
	await expect(
		page.getByRole('button', { name: 'Rename current session, 库存管理系统开发' }),
	).toBeVisible();
	await expect
		.poll(
			async () =>
				(await state(page)).session.find((session) => session.id === currentSession.id)
					?.work_item_id,
		)
		.toBe(oldItem.id);

	await page.getByRole('button', { name: 'Rename current session, 库存管理系统开发' }).click();
	await page.getByRole('textbox', { name: 'Name', exact: true }).fill('第1寺院');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('button', { name: 'Rename current session, 第1寺院' })).toBeVisible();
	await expect
		.poll(async () => {
			const data = await state(page);
			const item = data.work_item.find((row) => row.name === '第1寺院' && row.deleted_at === null);
			return (
				item !== undefined &&
				data.session.find((session) => session.id === currentSession.id)?.work_item_id === item.id
			);
		})
		.toBe(true);
	after = await state(page);
	const newItem = after.work_item.find(
		(item) => item.name === '第1寺院' && item.deleted_at === null,
	)!;
	expect(after.session.find((session) => session.id === currentSession.id)?.work_item_id).toBe(
		newItem.id,
	);
	expect(after.session.find((session) => session.id === previousSession.id)?.work_item_id).toBe(
		oldItem.id,
	);
	expect(after.work_item.find((item) => item.id === oldItem.id)?.name).toBe('库存管理系统开发');

	// The rename toast sits over the bottom of the sheet on phones; let it expire first.
	await expect(page.getByText('Renamed to 第1寺院.')).toBeHidden({ timeout: 20_000 });
	await page.getByRole('button', { name: 'Rename current session, 第1寺院' }).click();
	await page.getByRole('button', { name: 'Switch to another activity' }).click();
	await expect(page.getByRole('heading', { name: 'Switch activity' })).toBeVisible();
	await page.getByRole('textbox', { name: 'Search items' }).fill('修复洗手台');
	await page.getByRole('button', { name: '修复洗手台', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Rename current session, 修复洗手台' }),
	).toBeVisible();

	await page.getByRole('button', { name: 'Stop' }).click();
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	// Untitled sessions are named in place on the panel; once named, the name opens the sheet.
	const inline = page.getByRole('textbox', { name: 'Name this session' });
	await inline.fill('第1寺院');
	await inline.press('Enter');
	await expect(page.getByRole('button', { name: 'Rename current session, 第1寺院' })).toBeVisible();
	await expect
		.poll(async () => {
			const data = await state(page);
			const item = data.work_item.find((row) => row.name === '第1寺院' && row.deleted_at === null);
			return (
				data.session.filter((session) => session.end_at === null).length === 1 &&
				data.session.find((session) => session.end_at === null)?.work_item_id === item?.id
			);
		})
		.toBe(true);
});
