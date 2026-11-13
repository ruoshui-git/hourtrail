import { expect, test } from '@playwright/test';
import { acquireCloud, releaseCloud } from './helpers/auth';
import { localSyncState, signIn } from './helpers/sync';
import { scenarioSnapshot, waitForOutbox } from './helpers/scenarios';

test.use({ actionTimeout: 15_000 });

test('scenario G: offline session survives reload and syncs once to a second device', async ({
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
	const desktop = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
	const p = await phone.newPage();
	const d = await desktop.newPage();
	try {
		await signIn(p, `G phone ${suffix}`);
		await signIn(d, `G desktop ${suffix}`);
		await waitForOutbox(p);
		await phone.setOffline(true);
		await p.goto('/');
		await p.getByRole('button', { name: 'Start', exact: true }).click();
		await expect(p.getByRole('button', { name: 'Stop' })).toBeVisible();
		const id = (await scenarioSnapshot(p)).session?.find((session) => session.end_at === null)
			?.id as string;
		await p.getByRole('button', { name: 'Stop' }).click();
		await expect(p.getByText('Not tracking', { exact: true })).toBeVisible();
		await expect.poll(async () => (await localSyncState(p)).outbox.length).toBeGreaterThan(0);
		await p.goto('/history');
		await expect(p.getByRole('img', { name: 'Not backed up yet' }).first()).toBeVisible();
		await expect(p.getByRole('button', { name: /Offline\. \d+ changes? waiting/ })).toBeVisible();
		await p.reload();
		await expect
			.poll(async () => (await localSyncState(p)).sessions.some((s) => s.id === id))
			.toBe(true);
		await expect(p.getByRole('img', { name: 'Not backed up yet' }).first()).toBeVisible();
		await expect(p.getByRole('button', { name: /Offline\. \d+ changes? waiting/ })).toBeVisible();
		await phone.setOffline(false);
		await waitForOutbox(p);
		await d.reload();
		await expect
			.poll(async () => (await localSyncState(d)).sessions.filter((s) => s.id === id).length)
			.toBe(1);
	} finally {
		await phone.close();
		await desktop.close();
		releaseCloud();
	}
});
