import { expect, test } from '@playwright/test';
import { acquireCloud, releaseCloud } from './helpers/auth';
import { createSession, editSession, localSyncState, signIn } from './helpers/sync';
import { scenarioSnapshot, waitForOutbox } from './helpers/scenarios';

test.use({ actionTimeout: 15_000 });

test('scenario H: a desktop note edit reaches the phone without a duplicate', async ({
	browser,
	browserName,
	baseURL,
}) => {
	test.setTimeout(120_000);
	test.skip(
		browserName !== 'chromium',
		'Signed-in sync steps require Chromium Secure-cookie support on http://127.0.0.1.',
	);
	await acquireCloud();
	const suffix = Math.random().toString(36).slice(2, 7);
	const phone = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
	const desktop = await browser.newContext({
		baseURL,
		timezoneId: 'America/New_York',
		viewport: { width: 1280, height: 800 },
	});
	const p = await phone.newPage();
	const d = await desktop.newPage();
	try {
		await signIn(p, `H phone ${suffix}`);
		await signIn(d, `H desktop ${suffix}`);
		const id = await createSession(p, { name: `H item ${suffix}`, note: 'Original' });
		await createSession(p, { name: `H replacement ${suffix}` });
		await p.reload();
		await waitForOutbox(p);
		await d.reload();
		await expect
			.poll(async () => (await localSyncState(d)).sessions.some((s) => s.id === id))
			.toBe(true);
		const otherItemId = (await scenarioSnapshot(d)).work_item?.find(
			(item) => item.name === `H replacement ${suffix}`,
		)?.id as string;
		await d.goto('/history');
		await d.getByLabel('Search sessions').fill(`H item ${suffix}`);
		await d
			.getByRole('row')
			.filter({ hasText: `H item ${suffix}` })
			.click();
		const editor = d.getByRole('complementary', { name: 'Session editor' });
		await editor.getByLabel('Note').fill('Edited on desktop');
		await editor.getByLabel('Note').blur();
		await expect(editor.getByText('Saved', { exact: true })).toBeVisible();
		const end = editor.getByLabel('End');
		const previousEnd = await end.inputValue();
		const changedEnd = new Date(new Date(previousEnd).getTime() + 60_000);
		const localEnd = `${changedEnd.getFullYear()}-${String(changedEnd.getMonth() + 1).padStart(2, '0')}-${String(changedEnd.getDate()).padStart(2, '0')}T${String(changedEnd.getHours()).padStart(2, '0')}:${String(changedEnd.getMinutes()).padStart(2, '0')}`;
		await end.fill(localEnd);
		await end.blur();
		await expect(editor.getByText('Saved', { exact: true })).toBeVisible();
		const expectedEnd = await d.evaluate((value) => new Date(value).getTime(), localEnd);
		await editor.getByLabel('Choose work item').selectOption(otherItemId);
		await expect(editor.getByText('Saved', { exact: true })).toBeVisible();
		await waitForOutbox(d);
		await p.reload();
		await expect
			.poll(async () => {
				const state = await scenarioSnapshot(p);
				const session = state.session?.find((entry) => entry.id === id);
				return { note: session?.note, item: session?.work_item_id, end: session?.end_at };
			})
			.toEqual({ note: 'Edited on desktop', item: otherItemId, end: expectedEnd });
		await expect
			.poll(async () => (await localSyncState(p)).sessions.filter((s) => s.id === id).length)
			.toBe(1);
		expect((await localSyncState(p)).conflicts.filter((c) => c.record_id === id)).toHaveLength(0);
		await phone.setOffline(true);
		await desktop.setOffline(true);
		await editSession(p, id, 'Changed on phone');
		await editSession(d, id, 'Changed on desktop');
		await phone.setOffline(false);
		await desktop.setOffline(false);
		await p.reload();
		await d.reload();
		await waitForOutbox(p);
		await waitForOutbox(d);
		const conflictsFor = async (page: typeof p) =>
			(await localSyncState(page)).conflicts.filter(
				(row) => row.record_id === id && row.field === 'note',
			);
		await expect.poll(async () => (await conflictsFor(p)).length).toBe(1);
		await expect.poll(async () => (await conflictsFor(d)).length).toBe(1);
		const [conflictP] = (await conflictsFor(p)) as {
			id: string;
			kept_value: unknown;
			other_value: unknown;
		}[];
		const [conflictD] = (await conflictsFor(d)) as { id: string }[];
		expect(conflictP?.id).toBe(conflictD?.id);
		expect([conflictP?.kept_value, conflictP?.other_value].sort()).toEqual([
			'Changed on desktop',
			'Changed on phone',
		]);
		const day = await p.evaluate((sessionId) => {
			const open = indexedDB.open('hourtrail');
			return new Promise<string>((resolve, reject) => {
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const request = open.result.transaction('session').objectStore('session').get(sessionId);
					request.onerror = () => reject(request.error);
					request.onsuccess = () =>
						resolve(
							new Intl.DateTimeFormat('en-CA', {
								timeZone: 'America/New_York',
								year: 'numeric',
								month: '2-digit',
								day: '2-digit',
							}).format(request.result.start_at),
						);
				};
			});
		}, id);
		for (const page of [p, d]) {
			await page.goto(`/history/review?day=${day}`);
			await expect(page.getByText(/note was set on two devices/)).toBeVisible();
			await expect(page.getByRole('button', { name: 'Use other value' })).toBeVisible();
		}
	} finally {
		await phone.close();
		await desktop.close();
		releaseCloud();
	}
});
