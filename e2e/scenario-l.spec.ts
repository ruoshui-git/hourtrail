import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { acquireCloud, releaseCloud } from './helpers/auth';
import { signIn } from './helpers/sync';
import {
	clearSyncedStores,
	recoveryDataset,
	scenarioSnapshot,
	seedRecords,
	syncedRows,
	waitForOutbox,
} from './helpers/scenarios';

test.use({ actionTimeout: 15_000 });

test('scenario L: backup restore and a new device recover the synced records', async ({
	browser,
	browserName,
	baseURL,
}) => {
	test.setTimeout(180_000);
	test.skip(
		browserName !== 'chromium',
		'Signed-in sync steps require Chromium Secure-cookie support on http://127.0.0.1.',
	);
	await acquireCloud();
	const suffix = Math.random().toString(36).slice(2, 7);
	const phone = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
	const desktop = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
	const p = await phone.newPage();
	const d = await desktop.newPage();
	try {
		await signIn(p, `L phone ${suffix}`);
		await signIn(d, `L desktop ${suffix}`);
		const records = recoveryDataset(suffix);
		await seedRecords(p, records);
		const id = records.session[0]!.id;
		await p.reload();
		await waitForOutbox(p);
		await d.reload();
		await expect
			.poll(async () => (await scenarioSnapshot(d)).session?.some((row) => row.id === id))
			.toBe(true);
		const source = await scenarioSnapshot(p);
		await p.goto('/settings/backup');
		const downloading = p.waitForEvent('download');
		await p.getByRole('button', { name: 'Download backup', exact: true }).click();
		const backup = await readFile((await (await downloading).path())!);
		const fresh = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
		try {
			const restored = await fresh.newPage();
			await restored.goto('/settings/backup');
			await expect(
				restored.getByRole('button', { name: 'Restore from a backup file', exact: true }),
			).toBeEnabled();
			await clearSyncedStores(restored);
			await restored.getByLabel('Backup file', { exact: true }).setInputFiles({
				name: 'hourtrail-backup.json',
				mimeType: 'application/json',
				buffer: backup,
			});
			await restored.getByRole('button', { name: "Add what's missing", exact: true }).click();
			await expect
				.poll(async () => (await scenarioSnapshot(restored)).session?.some((row) => row.id === id))
				.toBe(true);
			const restoredState = await scenarioSnapshot(restored);
			for (const store of [
				'activity_type',
				'project',
				'work_item',
				'session',
				'place',
				'session_fix',
				'review_mark',
				'day_review',
				'setting',
				'report_preset',
				'conflict',
			])
				expect(syncedRows(restoredState, store)).toEqual(syncedRows(source, store));
		} finally {
			await fresh.close();
		}
		await d.reload();
		await expect
			.poll(async () => (await scenarioSnapshot(d)).session?.some((row) => row.id === id))
			.toBe(true);
		const replacement = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
		try {
			const n = await replacement.newPage();
			await signIn(n, `L new device ${suffix}`);
			await expect
				.poll(async () => (await scenarioSnapshot(n)).session?.some((row) => row.id === id))
				.toBe(true);
			const newState = await scenarioSnapshot(n);
			for (const store of [
				'activity_type',
				'project',
				'work_item',
				'session',
				'place',
				'session_fix',
				'review_mark',
				'day_review',
				'setting',
				'report_preset',
				'conflict',
			])
				expect(syncedRows(newState, store)).toEqual(syncedRows(source, store));
		} finally {
			await replacement.close();
		}
	} finally {
		await phone.close();
		await desktop.close();
		releaseCloud();
	}
});
