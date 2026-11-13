import {
	dueReminders,
	readSetting,
	type ReminderSession,
	type ReminderState,
} from '@hourtrail/core';
import type { Env } from '../env';
import { createPushSender } from './web-push';

export const MAX_REMINDER_SENDS = 40;
type SessionRow = Omit<ReminderSession, 'remind'> & {
	remind: number | null;
	reminder_json: string | null;
	last_sent_at: number | null;
	sent_count: number | null;
};
type SubscriptionRow = { endpoint: string; p256dh: string; auth: string };

export async function runReminderCron(env: Env, now: number): Promise<void> {
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
		console.error('VAPID keys are not configured');
		return;
	}
	const db = env.DB;
	// All decision inputs, including work-item names and state, in one D1 read.
	const rows = await db
		.prepare(
			`
		SELECT s.id, json_extract(s.data, '$.start_at') AS start_at,
			json_extract(t.data, '$.remind') AS remind,
			json_extract(w.data, '$.name') AS work_item_name,
			json_quote(json_extract(r.data, '$.value')) AS reminder_json, rs.last_sent_at, rs.sent_count
		FROM records s
		LEFT JOIN records t ON t.entity = 'activity_type'
			AND t.id = json_extract(s.data, '$.type_id') AND t.deleted_at IS NULL
		LEFT JOIN records w ON w.entity = 'work_item'
			AND w.id = json_extract(s.data, '$.work_item_id') AND w.deleted_at IS NULL
		LEFT JOIN records r ON r.entity = 'setting' AND r.id = 'reminder' AND r.deleted_at IS NULL
		LEFT JOIN reminder_state rs ON rs.session_id = s.id
		WHERE s.entity = 'session' AND s.deleted_at IS NULL AND json_extract(s.data, '$.end_at') IS NULL
	`,
		)
		.all<SessionRow>();
	const subscriptions = await db
		.prepare(
			`
		SELECT p.endpoint, p.p256dh, p.auth FROM push_subscriptions p
		JOIN devices d ON d.id = p.device_id AND d.revoked_at IS NULL
		ORDER BY p.created_at, p.endpoint
	`,
		)
		.all<SubscriptionRow>();
	const state: ReminderState[] = rows.results.flatMap((row) =>
		row.last_sent_at === null
			? []
			: [
					{
						session_id: row.id,
						last_sent_at: row.last_sent_at,
						sent_count: row.sent_count!,
					},
				],
	);
	const due = dueReminders(
		{
			sessions: rows.results.map((row) => ({ ...row, remind: row.remind === 1 })),
			setting: readSetting('reminder', JSON.parse(rows.results[0]?.reminder_json ?? 'null')),
			state,
		},
		now,
	);
	const expired = new Set<string>();
	const sent: string[] = [];
	if (due.length && subscriptions.results.length) {
		const send = await createPushSender(
			env.VAPID_PUBLIC_KEY,
			env.VAPID_PRIVATE_KEY,
			env.APP_ORIGIN,
			now,
		);
		let budget = MAX_REMINDER_SENDS;
		for (const reminder of due) {
			const active = subscriptions.results.filter((s) => !expired.has(s.endpoint));
			if (!active.length) break;
			if (active.length > budget && budget !== MAX_REMINDER_SENDS) break;
			if (active.length > MAX_REMINDER_SENDS) {
				console.warn(
					'Reminder exceeds the per-run device budget; sending to the first 40 subscriptions',
					{ sessionId: reminder.session_id },
				);
			}
			const targets = active.slice(0, budget);
			budget -= targets.length;
			const results = await Promise.all(
				targets.map(async (subscription) => {
					try {
						const response = await send(
							{ endpoint: subscription.endpoint, keys: subscription },
							{ web_push: 8030, notification: reminder.notification },
						);
						await response.body?.cancel();
						if (response.status === 404 || response.status === 410) {
							expired.add(subscription.endpoint);
							return false;
						}
						if (response.ok) return true;
						console.error('Reminder push failed', {
							sessionId: reminder.session_id,
							status: response.status,
						});
					} catch {
						console.error('Reminder push failed', { sessionId: reminder.session_id });
					}
					return false;
				}),
			);
			// Delivery is best effort: one acceptance counts, so healthy devices are
			// not notified again just because another subscription failed.
			if (results.some(Boolean)) sent.push(reminder.session_id);
			if (!budget) break;
		}
	}
	// Two reads, <=40 fetches, and two write statements: at most 44 subrequests.
	// Batched JSON inputs avoid one D1 statement per expired endpoint or session.
	await db.batch([
		db
			.prepare(
				`DELETE FROM push_subscriptions
			WHERE endpoint IN (SELECT value FROM json_each(?))
			OR device_id IN (SELECT id FROM devices WHERE revoked_at IS NOT NULL)`,
			)
			.bind(JSON.stringify([...expired])),
		db
			.prepare(
				`INSERT INTO reminder_state (session_id, last_sent_at, sent_count)
			SELECT value, ?2, 1 FROM json_each(?1) WHERE 1
			ON CONFLICT(session_id) DO UPDATE SET last_sent_at = excluded.last_sent_at,
			sent_count = reminder_state.sent_count + 1`,
			)
			.bind(JSON.stringify(sent), now),
	]);
}
