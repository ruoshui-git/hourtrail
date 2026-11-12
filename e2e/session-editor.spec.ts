import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

type SessionRecord = {
	id: string;
	note: string;
	source: string;
	work_item_id: string | null;
	type_id: string;
	start_at: number;
	deleted_at: number | null;
};
type SeedData = {
	items: { id: string; name: string; type_id: string }[];
	types: { id: string; name: string }[];
	sessions: SessionRecord[];
};

const shots = process.env.HT_RUN_DIR ? join(process.env.HT_RUN_DIR, 'shots') : undefined;

test.use({ timezoneId: 'America/New_York' });

async function seed(page: Page, scenario: 'empty' | 'idle' | 'running' | 'untitled') {
	await page.goto(`/dev/seed?scenario=${scenario}`);
	await expect(page.locator('[data-seed-status]')).toHaveText(`Seeded ${scenario}`);
}

async function dismissInstallHint(page: Page) {
	const notNow = page.getByRole('button', { name: 'Not now' });
	await notNow.waitFor({ state: 'visible', timeout: 2000 }).catch(() => undefined);
	if (await notNow.isVisible().catch(() => false)) await notNow.click();
}

async function readData(page: Page): Promise<SeedData> {
	return page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const getAll = <T>(table: string) =>
			new Promise<T[]>((resolve, reject) => {
				const query = database.transaction(table).objectStore(table).getAll();
				query.onsuccess = () => resolve(query.result);
				query.onerror = () => reject(query.error);
			});
		const [items, types, sessions] = await Promise.all([
			getAll<SeedData['items'][number]>('work_item'),
			getAll<SeedData['types'][number]>('activity_type'),
			getAll<SessionRecord>('session'),
		]);
		return { items, types, sessions };
	});
}

async function openManual(
	page: Page,
	options: { start?: number; end?: number; workItemId?: string | null } = {},
) {
	const query = new URLSearchParams({ new: '1' });
	if (options.start !== undefined) query.set('start', String(options.start));
	if (options.end !== undefined) query.set('end', String(options.end));
	if (options.workItemId !== undefined && options.workItemId !== null) {
		query.set('work_item_id', options.workItemId);
	}
	await page.goto(`/dev/editor?${query}`);
	await expect(page.getByRole('heading', { name: 'Add session' })).toBeVisible();
	await expect(page.getByLabel('Start')).toBeVisible();
}

async function dayTimes(page: Page) {
	return page.evaluate(() => {
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		const at = (day: Date, hour: number, minute = 0) => {
			const value = new Date(day);
			value.setHours(hour, minute, 0, 0);
			return value.getTime();
		};
		const today = new Date();
		return {
			yesterdayStart: at(yesterday, 9),
			yesterdayEnd: at(yesterday, 10),
			yesterdaySecondStart: at(yesterday, 11),
			yesterdaySecondEnd: at(yesterday, 12),
			overlapStart: at(today, 7, 15),
			overlapEnd: at(today, 8, 15),
		};
	});
}

async function localDateTime(page: Page, timestamp: number) {
	return page.evaluate((at) => {
		const value = new Date(at);
		const pad = (part: number) => String(part).padStart(2, '0');
		return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
	}, timestamp);
}

test('session editor supports manual entry, safe edits, warnings, delete undo, and Unicode', async ({
	page,
}, testInfo) => {
	await page.clock.setFixedTime(new Date('2026-11-12T10:30:00-05:00'));
	await seed(page, 'running');
	const data = await readData(page);
	const inventory = data.items.find((item) => item.name === '库存管理系统开发')!;
	const sink = data.items.find((item) => item.name === '修复洗手台')!;
	const volunteer = data.types.find((type) => type.name === 'Volunteer')!;
	const beforeHomeEdits = data.sessions.filter((session) => session.work_item_id === inventory.id);
	const runningInventory = beforeHomeEdits.find((session) => session.end_at === null)!;
	const completedInventory = beforeHomeEdits.find((session) => session.end_at !== null)!;

	if (testInfo.project.name === 'webkit-iphone') {
		await page.goto('/settings/appearance');
		await dismissInstallHint(page);
		await page.getByRole('radio', { name: 'Light' }).click();
	} else if (testInfo.project.name === 'chromium') {
		await page.goto('/settings/appearance');
		await dismissInstallHint(page);
		await page.getByRole('radio', { name: 'Dark' }).click();
	}
	await page.goto('/');
	await page.getByRole('button', { name: 'Stop' }).click();
	await page.getByRole('button', { name: 'Add note' }).click();
	await expect(page.getByRole('heading', { name: 'Edit session' })).toBeVisible();
	await expect(page.getByLabel('Note')).toBeFocused();
	await page.getByLabel('Note').fill('修复洗手台：补齐零件清单');
	await page.getByLabel('Note').blur();
	await expect
		.poll(
			async () =>
				(await readData(page)).sessions.find((session) => session.id === runningInventory.id)?.note,
		)
		.toBe('修复洗手台：补齐零件清单');
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	if (shots) {
		await mkdir(shots, { recursive: true });
		await page.locator('.sheet .body').evaluate((element) => (element.scrollTop = 0));
		await page.screenshot({
			path: join(
				shots,
				testInfo.project.name === 'webkit-iphone'
					? 'session-editor-phone-light.png'
					: 'session-editor-desktop-dark.png',
			),
			fullPage: false,
		});
	}
	await page.getByRole('button', { name: 'Close' }).click();

	// A second session of the same item gets its own note through the Home ribbon.
	const segment = page.getByRole('button', { name: /^库存管理系统开发,/ }).first();
	await segment.click();
	await expect(page.getByRole('heading', { name: 'Edit session' })).toBeVisible();
	await expect(page.getByLabel('Note')).toHaveValue('权限开发 and import testing.');
	await page.getByLabel('Note').fill('第二段库存工作记录');
	await page.getByLabel('Note').blur();
	await page.getByRole('button', { name: 'Close' }).click();
	let updated = await readData(page);
	const inventorySessions = updated.sessions.filter(
		(session) => session.work_item_id === inventory.id,
	);
	expect(inventorySessions).toHaveLength(2);
	expect(inventorySessions.map((session) => session.note).sort()).toEqual(
		['修复洗手台：补齐零件清单', '第二段库存工作记录'].sort(),
	);
	expect(updated.sessions.find((session) => session.id === completedInventory.id)?.note).toBe(
		'第二段库存工作记录',
	);
	expect(inventorySessions.map((session) => session.work_item_id)).toEqual([
		beforeHomeEdits[0]!.work_item_id,
		beforeHomeEdits[1]!.work_item_id,
	]);

	const times = await dayTimes(page);
	await openManual(page, {
		start: times.yesterdayStart,
		end: times.yesterdayEnd,
		workItemId: inventory.id,
	});
	await page.getByLabel('Note').fill('库存管理系统开发');
	await page.getByRole('button', { name: 'Add session' }).click();
	await expect(page.getByRole('heading', { name: 'Add session' })).toHaveCount(0);
	updated = await readData(page);
	const firstManual = updated.sessions.find((session) => session.note === '库存管理系统开发')!;
	expect(firstManual.source).toBe('manual');
	expect(firstManual.work_item_id).toBe(inventory.id);
	expect(firstManual.type_id).toBe(inventory.type_id);
	await page.goto(`/dev/editor?id=${encodeURIComponent(firstManual.id)}`);
	await expect(page.getByRole('heading', { name: 'Edit session' })).toBeVisible();
	await page.getByLabel('End').fill('');
	await expect(
		page.getByText('Enter an end time for this session.', { exact: true }),
	).toBeVisible();
	await page.getByRole('button', { name: 'Close' }).click();
	expect(
		(await readData(page)).sessions.find((session) => session.id === firstManual.id)?.end_at,
	).not.toBeNull();

	await openManual(page);
	await expect(page.getByLabel('End')).toBeEnabled();
	await page.getByLabel('Start').fill(await localDateTime(page, times.yesterdaySecondStart));
	await page.getByLabel('End').fill(await localDateTime(page, times.yesterdaySecondEnd));
	await page.getByLabel('Choose work item').selectOption(sink.id);
	await page.getByLabel('Activity type').selectOption({ label: 'Volunteer' });
	await page.getByLabel('Note').fill('第二寺院志愿工作');
	await page.getByRole('button', { name: 'Add session' }).click();
	updated = await readData(page);
	const secondManual = updated.sessions.find((session) => session.note === '第二寺院志愿工作')!;
	expect(secondManual.source).toBe('manual');
	expect(secondManual.work_item_id).toBe(sink.id);
	expect(secondManual.type_id).toBe(volunteer.id);

	await openManual(page, { start: times.yesterdayStart, end: times.yesterdayEnd });
	await page.getByLabel('End').fill(await localDateTime(page, times.yesterdayStart - 60_000));
	await expect(page.getByText('End must be after start.', { exact: true })).toBeVisible();
	if (shots && testInfo.project.name === 'chromium') {
		await page.screenshot({
			path: join(shots, 'session-editor-end-before-start.png'),
			fullPage: false,
		});
	}
	await page.getByRole('button', { name: 'Close' }).click();

	await openManual(page, { start: times.overlapStart, end: times.overlapEnd, workItemId: sink.id });
	await page.getByLabel('Start').fill(await localDateTime(page, times.overlapStart));
	await page.getByLabel('End').fill(await localDateTime(page, times.overlapEnd));
	await expect(
		page.getByRole('status').filter({ hasText: 'Overlaps Building Maintenance by 10m' }),
	).toBeVisible();
	if (shots && testInfo.project.name === 'chromium') {
		await page.getByText('Overlaps Building Maintenance by 10m').scrollIntoViewIfNeeded();
		await page.screenshot({
			path: join(shots, 'session-editor-overlap-warning.png'),
			fullPage: false,
		});
	}
	await page.getByRole('button', { name: 'Add session' }).click();
	updated = await readData(page);
	const overlap = updated.sessions.find((session) => session.start_at === times.overlapStart)!;
	await page.goto(`/dev/editor?id=${encodeURIComponent(overlap.id)}`);
	await expect(page.getByRole('heading', { name: 'Edit session' })).toBeVisible();
	await page.getByRole('button', { name: 'Delete session' }).click();
	await page.getByRole('button', { name: 'Delete session', exact: true }).last().click();
	await expect(page.getByText('Session deleted')).toBeVisible();
	await page.getByRole('button', { name: 'Undo' }).click();
	expect(
		(await readData(page)).sessions.find((session) => session.id === overlap.id)?.deleted_at,
	).toBeNull();

	await page.reload();
	await page.goto(`/dev/editor?id=${encodeURIComponent(firstManual.id)}`);
	await expect(page.getByLabel('Note')).toHaveValue('库存管理系统开发');
	const reloaded = await readData(page);
	expect(reloaded.sessions.find((session) => session.id === firstManual.id)?.note).toBe(
		'库存管理系统开发',
	);
});
