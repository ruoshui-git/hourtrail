import { expect, test } from '@playwright/test';
import {
	createSession,
	deviceIdentityReady,
	editSession,
	localSyncState,
	seedSessions,
	signIn,
} from './helpers/sync';

test.use({ actionTimeout: 15_000 });

test('syncs edits across devices, retries a processed batch, and uploads offline work', async ({
	browser,
	browserName,
	baseURL,
}) => {
	test.setTimeout(180_000);
	test.skip(
		browserName !== 'chromium',
		'Signed-in sync steps require Chromium Secure-cookie support on http://127.0.0.1.',
	);
	const suffix = Math.random().toString(36).slice(2, 7);
	const contextA = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
	const contextB = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
	const a = await contextA.newPage();
	const b = await contextB.newPage();
	try {
		await signIn(a, `Sync A ${suffix}`);
		await signIn(b, `Sync B ${suffix}`);

		const sessionId = await createSession(a, {
			name: `库存管理系统开发 ${suffix}`,
			note: '第1寺院',
		});
		await a.reload();
		await expect.poll(async () => (await localSyncState(a)).outbox.length).toBe(0);
		await b.reload();
		await expect
			.poll(
				async () =>
					(await localSyncState(b)).sessions.find((session) => session.id === sessionId)?.note,
			)
			.toBe('第1寺院');

		await editSession(b, sessionId, 'Updated from B');
		await b.reload();
		await expect.poll(async () => (await localSyncState(b)).outbox.length).toBe(0);
		await a.reload();
		await expect
			.poll(
				async () =>
					(await localSyncState(a)).sessions.find((session) => session.id === sessionId)?.note,
			)
			.toBe('Updated from B');

		const batches: string[] = [];
		let firstPush = true;
		await a.route('**/api/sync/push', async (route) => {
			const body = route.request().postDataJSON() as { batch_id: string };
			batches.push(body.batch_id);
			if (firstPush) {
				firstPush = false;
				const response = await route.fetch();
				await response.body();
				await route.abort('failed');
			} else await route.continue();
		});
		const replayId = await createSession(a, {
			name: `Replay ${suffix}`,
			note: 'Processed once on the server',
		});
		await a.reload();
		await expect.poll(async () => batches.length).toBe(1);
		await a.reload();
		await expect.poll(async () => batches.length).toBeGreaterThanOrEqual(2);
		expect(batches[1]).toBe(batches[0]);
		await expect.poll(async () => (await localSyncState(a)).outbox.length).toBe(0);
		await b.reload();
		await expect
			.poll(
				async () =>
					(await localSyncState(b)).sessions.filter((session) => session.id === replayId).length,
			)
			.toBe(1);

		await contextA.setOffline(true);
		const offlineId = await createSession(a, {
			name: `Offline ${suffix}`,
			note: 'Captured without a connection',
		});
		await expect.poll(async () => (await localSyncState(a)).outbox.length).toBeGreaterThan(0);
		await a.reload();
		await expect.poll(async () => (await localSyncState(a)).outbox.length).toBeGreaterThan(0);
		await contextA.setOffline(false);
		await expect.poll(async () => (await localSyncState(a)).outbox.length).toBe(0);
		await b.reload();
		await expect
			.poll(async () =>
				(await localSyncState(b)).sessions.some((session) => session.id === offlineId),
			)
			.toBe(true);

		await contextA.setOffline(true);
		await contextB.setOffline(true);
		await editSession(a, sessionId, 'Conflict from A');
		await editSession(b, sessionId, 'Conflict from B');
		await contextA.setOffline(false);
		await contextB.setOffline(false);
		await expect.poll(async () => (await localSyncState(a)).outbox.length).toBe(0);
		await expect.poll(async () => (await localSyncState(b)).outbox.length).toBe(0);
		await a.reload();
		await b.reload();
		// Exactly one conflict for this session's note, the same record on both devices.
		const noteConflicts = async (page: typeof a) =>
			(await localSyncState(page)).conflicts.filter(
				(conflict) => conflict.record_id === sessionId && conflict.field === 'note',
			);
		await expect.poll(async () => (await noteConflicts(a)).length).toBe(1);
		await expect.poll(async () => (await noteConflicts(b)).length).toBe(1);
		expect((await noteConflicts(a))[0]!.id).toBe((await noteConflicts(b))[0]!.id);
		const [noteA, noteB] = await Promise.all([
			localSyncState(a).then(
				(state) => state.sessions.find((session) => session.id === sessionId)?.note,
			),
			localSyncState(b).then(
				(state) => state.sessions.find((session) => session.id === sessionId)?.note,
			),
		]);
		expect(noteA).toBe(noteB);
	} finally {
		await contextA.close();
		await contextB.close();
	}
});

test('uploads 300 pre-sign-in sessions in persisted batches', async ({
	browser,
	browserName,
	baseURL,
}) => {
	test.setTimeout(240_000);
	test.skip(
		browserName !== 'chromium',
		'Signed-in sync steps require Chromium Secure-cookie support on http://127.0.0.1.',
	);
	const suffix = Math.random().toString(36).slice(2, 7);
	const contextA = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
	const contextB = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
	const a = await contextA.newPage();
	const b = await contextB.newPage();
	try {
		await a.goto('/');
		await expect.poll(() => deviceIdentityReady(a)).toBe(true);
		await seedSessions(a, suffix, 300);
		let pushRequests = 0;
		a.on('request', (request) => {
			if (request.url().includes('/api/sync/push')) pushRequests++;
		});
		const started = Date.now();
		await signIn(a, `Upload A ${suffix}`);
		await expect
			.poll(async () => (await localSyncState(a)).outbox.length, { timeout: 180_000 })
			.toBe(0);
		const elapsed = Date.now() - started;
		await signIn(b, `Upload B ${suffix}`);
		await expect
			.poll(
				async () =>
					(await localSyncState(b)).sessions.filter((session) =>
						session.note.startsWith(`Seeded ${suffix} session `),
					).length,
				{ timeout: 90_000 },
			)
			.toBe(300);
		expect(pushRequests).toBeGreaterThanOrEqual(6);
		test.info().annotations.push({
			type: 'first-upload-metrics',
			description: `${pushRequests} push requests; ${elapsed} ms for 300 sessions`,
		});
		console.log(`First upload: ${pushRequests} push requests in ${elapsed} ms for 300 sessions.`);
	} finally {
		await contextA.close();
		await contextB.close();
	}
});
