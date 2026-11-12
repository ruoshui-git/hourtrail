import { expect, test } from '@playwright/test';

test('work items keep session identity and type history through edits and archive', async ({
	page,
}) => {
	await page.goto('/items');
	const installHint = page.getByRole('dialog', { name: 'Add Hourtrail to your Home Screen' });
	await installHint
		.getByRole('button', { name: 'Not now' })
		.click({ timeout: 4000 })
		.catch(() => {});
	await page.getByRole('button', { name: 'Add work item' }).first().click();
	await page.getByLabel('Name').fill('库存管理系统开发');
	await page.getByLabel('Project').selectOption('__new__');
	await page.getByLabel('New project name').fill('Temple');
	await page.getByRole('button', { name: 'Add work item' }).last().click();
	await expect(page.getByText('Work item added')).toBeVisible();
	await page.reload();
	await expect(page.getByText('库存管理系统开发')).toBeVisible();
	await page.getByRole('button', { name: 'Details for 库存管理系统开发' }).click();
	await page.getByRole('switch', { name: 'Pinned' }).click();
	await page.getByRole('button', { name: 'Items' }).click();
	await page.getByLabel('Search work items').fill('库存');
	await page.getByRole('button', { name: 'Start 库存管理系统开发' }).click();
	await expect(page.getByText('Started 库存管理系统开发')).toBeVisible();
	const before = await page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const tx = db.transaction(['work_item', 'session'], 'readonly');
		const [items, sessions] = await Promise.all([
			new Promise<Record<string, unknown>[]>((resolve, reject) => {
				const r = tx.objectStore('work_item').getAll();
				r.onsuccess = () => resolve(r.result);
				r.onerror = () => reject(r.error);
			}),
			new Promise<Record<string, unknown>[]>((resolve, reject) => {
				const r = tx.objectStore('session').getAll();
				r.onsuccess = () => resolve(r.result);
				r.onerror = () => reject(r.error);
			}),
		]);
		db.close();
		return {
			item: items.find((item) => item.name === '库存管理系统开发'),
			session: sessions.find(
				(item) => item.work_item_id === items.find((x) => x.name === '库存管理系统开发')?.id,
			),
		};
	});
	expect(before.session).toBeTruthy();
	await page.getByRole('button', { name: 'Details for 库存管理系统开发' }).click();
	await page.getByLabel('Activity type').selectOption({ label: 'Volunteer' });
	await page.getByLabel('Description').click();
	await expect
		.poll(async () =>
			page.evaluate(async () => {
				const request = indexedDB.open('hourtrail');
				const db = await new Promise<IDBDatabase>((resolve) => {
					request.onsuccess = () => resolve(request.result);
				});
				const tx = db.transaction(['work_item', 'session'], 'readonly');
				const [items, sessions] = await Promise.all(
					['work_item', 'session'].map(
						(store) =>
							new Promise<Record<string, unknown>[]>((resolve) => {
								const r = tx.objectStore(store).getAll();
								r.onsuccess = () => resolve(r.result);
							}),
					),
				);
				db.close();
				const item = items.find((x) => x.name === '库存管理系统开发');
				const session = sessions.find((x) => x.work_item_id === item?.id);
				return {
					type_id: item?.type_id,
					session_type_id: session?.type_id,
					item_id: item?.id,
					session_item_id: session?.work_item_id,
				};
			}),
		)
		.toMatchObject({
			type_id: '00000000-0000-7000-8000-000000000003',
			session_type_id: before.session?.type_id,
			item_id: before.item?.id,
			session_item_id: before.item?.id,
		});
	await page.getByLabel('Name').fill('库存系统开发');
	await page.getByRole('heading', { name: 'Total time' }).click();
	await expect
		.poll(async () =>
			page.evaluate(async () => {
				const request = indexedDB.open('hourtrail');
				const db = await new Promise<IDBDatabase>((resolve) => {
					request.onsuccess = () => resolve(request.result);
				});
				const tx = db.transaction(['work_item', 'session'], 'readonly');
				const [items, sessions] = await Promise.all(
					['work_item', 'session'].map(
						(store) =>
							new Promise<Record<string, unknown>[]>((resolve) => {
								const r = tx.objectStore(store).getAll();
								r.onsuccess = () => resolve(r.result);
							}),
					),
				);
				db.close();
				const item = items.find((x) => x.name === '库存系统开发');
				const session = sessions.find((x) => x.work_item_id === item?.id);
				return { item_id: item?.id, session_item_id: session?.work_item_id };
			}),
		)
		.toMatchObject({ item_id: before.item?.id, session_item_id: before.item?.id });
	await page.getByRole('button', { name: 'Archive' }).click();
	await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();
	await page.mouse.move(4, 4);
	await page.getByText('Work item archived').waitFor({ state: 'hidden' });
	await page.getByRole('button', { name: 'Restore' }).click();
	await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('heading', { name: '库存系统开发' })).toBeVisible();
});
