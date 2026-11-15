import {
	dueReminders,
	trackingNotices,
	readSetting,
	type ReminderSession,
	type ReminderState,
	type TrackingNoticeSession,
} from '@hourtrail/core';
import type { Env } from '../env';
import { createPushSender } from './web-push';

export const MAX_REMINDER_SENDS = 40;
type SessionRow = Omit<ReminderSession, 'remind'> &
	Omit<TrackingNoticeSession, 'id' | 'start_at'> & {
		id: string;
		start_at: number;
		remind: number | null;
		reminder_json: string | null;
		tracking_notice_json: string | null;
		last_sent_at: number | null;
		sent_count: number | null;
		tracking_sent_at: number | null;
	};
type SubscriptionRow = { endpoint: string; p256dh: string; auth: string };
type Notification = {
	title: string;
	body: string;
	navigate: string;
	tag?: string;
};

export async function runReminderCron(env: Env, now: number): Promise<void> {
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
		console.error('VAPID keys are not configured');
		return;
	}
	const db = env.DB;
	// All decision inputs, names, time zones and both kinds of state in one D1 read.
	const rows = await db
		.prepare(
			`
		SELECT s.id, json_extract(s.data, '$.start_at') AS start_at,
			json_extract(s.data, '$.start_tz') AS start_tz,
			json_extract(s.data, '$.end_at') AS end_at,
			json_extract(t.data, '$.remind') AS remind,
			json_extract(w.data, '$.name') AS work_item_name,
			json_quote(json_extract(r.data, '$.value')) AS reminder_json,
			json_quote(json_extract(n.data, '$.value')) AS tracking_notice_json,
			rs.last_sent_at, rs.sent_count, ts.sent_at AS tracking_sent_at
		FROM records s
		LEFT JOIN records t ON t.entity = 'activity_type'
			AND t.id = json_extract(s.data, '$.type_id') AND t.deleted_at IS NULL
		LEFT JOIN records w ON w.entity = 'work_item'
			AND w.id = json_extract(s.data, '$.work_item_id') AND w.deleted_at IS NULL
		LEFT JOIN records r ON r.entity = 'setting' AND r.id = 'reminder' AND r.deleted_at IS NULL
		LEFT JOIN records n ON n.entity = 'setting' AND n.id = 'tracking_notice' AND n.deleted_at IS NULL
		LEFT JOIN reminder_state rs ON rs.session_id = s.id
		LEFT JOIN tracking_notice_state ts ON ts.session_id = s.id
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
	const liveIds = rows.results.map((row) => row.id);
	const state: ReminderState[] = rows.results.flatMap((row) =>
		row.last_sent_at === null
			? []
			: [{ session_id: row.id, last_sent_at: row.last_sent_at, sent_count: row.sent_count! }],
	);
	const sessions = rows.results.map((row) => ({ ...row, remind: row.remind === 1 }));
	const due = dueReminders(
		{
			sessions,
			setting: readSetting('reminder', JSON.parse(rows.results[0]?.reminder_json ?? 'null')),
			state,
		},
		now,
	);
	const tracking = trackingNotices(
		{
			sessions: rows.results,
			setting: readSetting(
				'tracking_notice',
				JSON.parse(rows.results[0]?.tracking_notice_json ?? 'null'),
			),
			sent_session_ids: rows.results
				.filter((row) => row.tracking_sent_at !== null)
				.map((row) => row.id),
		},
		now,
	);
	const expired = new Set<string>();
	const reminderSent: string[] = [];
	const trackingSent: string[] = [];
	const activeSubscriptions = () => subscriptions.results.filter((s) => !expired.has(s.endpoint));
	if (subscriptions.results.length && (due.length || tracking.length)) {
		const send = await createPushSender(
			env.VAPID_PUBLIC_KEY,
			env.VAPID_PRIVATE_KEY,
			env.APP_ORIGIN,
			now,
		);
		let budget = MAX_REMINDER_SENDS;
		const deliver = async (
			sessionId: string,
			notification: Notification,
			kind: 'Reminder' | 'Tracking',
		) => {
			const active = activeSubscriptions();
			if (!active.length || (active.length > budget && budget !== MAX_REMINDER_SENDS)) return false;
			if (active.length > MAX_REMINDER_SENDS) {
				console.warn(
					`${kind} exceeds the per-run device budget; sending to the first 40 subscriptions`,
					{
						sessionId,
					},
				);
			}
			const targets = active.slice(0, budget);
			budget -= targets.length;
			const results = await Promise.all(
				targets.map(async (subscription) => {
					try {
						const response = await send(
							{ endpoint: subscription.endpoint, keys: subscription },
							{ web_push: 8030, notification },
						);
						await response.body?.cancel();
						if (response.status === 404 || response.status === 410) {
							expired.add(subscription.endpoint);
							return false;
						}
						if (response.ok) return true;
						console.error(`${kind} push failed`, { sessionId, status: response.status });
					} catch {
						console.error(`${kind} push failed`, { sessionId });
					}
					return false;
				}),
			);
			return results.some(Boolean);
		};
		// Reminder notifications retain priority over the one-time tracking notices.
		for (const reminder of due) {
			if (await deliver(reminder.session_id, reminder.notification, 'Reminder'))
				reminderSent.push(reminder.session_id);
			if (!budget) break;
		}
		if (budget) {
			for (const notice of tracking) {
				if (await deliver(notice.session_id, notice.notification, 'Tracking'))
					trackingSent.push(notice.session_id);
				if (!budget) break;
			}
		}
	}
	// Two reads, <=40 fetches, and four write statements (<=46 subrequests).
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
			.bind(JSON.stringify(reminderSent), now),
		db
			.prepare(
				`INSERT INTO tracking_notice_state (session_id, sent_at)
			SELECT value, ?2 FROM json_each(?1) WHERE 1
			ON CONFLICT(session_id) DO NOTHING`,
			)
			.bind(JSON.stringify(trackingSent), now),
		db
			.prepare(
				`DELETE FROM tracking_notice_state
			WHERE session_id NOT IN (SELECT value FROM json_each(?))`,
			)
			.bind(JSON.stringify(liveIds)),
	]);
}
