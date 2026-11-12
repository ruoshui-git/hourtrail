import { expect, type Page } from '@playwright/test';

export type WorkItemRecord = { id: string; name: string; type_id: string };
export type ActivityTypeRecord = { id: string; name: string };
export type SessionRecord = {
	id: string;
	work_item_id: string | null;
	type_id: string;
	start_at: number;
	end_at: number | null;
	note: string;
	source: string;
	deleted_at: number | null;
};
export type AcceptanceData = {
	work_item: WorkItemRecord[];
	activity_type: ActivityTypeRecord[];
	session: SessionRecord[];
};

export async function dismissInstallHint(page: Page) {
	const notNow = page.getByRole('button', { name: 'Not now' });
	await notNow.waitFor({ state: 'visible', timeout: 2000 }).catch(() => undefined);
	if (await notNow.isVisible().catch(() => false)) await notNow.click();
}

export async function seed(page: Page, scenario: 'empty' | 'idle' | 'running' | 'untitled') {
	await page.goto(`/dev/seed?scenario=${scenario}`);
	await expect(page.locator('[data-seed-status]')).toHaveText(`Seeded ${scenario}`);
}

export async function readRecords(page: Page): Promise<AcceptanceData> {
	return page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const read = <T>(name: string) =>
			new Promise<T[]>((resolve, reject) => {
				const query = db.transaction(name, 'readonly').objectStore(name).getAll();
				query.onsuccess = () => resolve(query.result);
				query.onerror = () => reject(query.error);
			});
		const [work_item, activity_type, session] = await Promise.all([
			read<WorkItemRecord>('work_item'),
			read<ActivityTypeRecord>('activity_type'),
			read<SessionRecord>('session'),
		]);
		db.close();
		return { work_item, activity_type, session };
	});
}

export async function clearSessions(page: Page) {
	await page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction('session', 'readwrite');
			transaction.objectStore('session').clear();
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
		db.close();
	});
}

export async function openHome(page: Page) {
	await page.goto('/');
	await dismissInstallHint(page);
}
