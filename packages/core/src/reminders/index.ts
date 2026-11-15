import { formatHours } from '../report/format';
import type { Session, SettingValues } from '../schema';

export type ReminderSession = Pick<Session, 'id' | 'start_at'> & {
	remind: boolean;
	work_item_name: string | null;
};
export type ReminderState = { session_id: string; last_sent_at: number; sent_count: number };
export type ReminderNotification = { title: string; body: string; navigate: string };
export type DueReminder = { session_id: string; notification: ReminderNotification };
export type ReminderInput = {
	sessions: readonly ReminderSession[];
	setting: SettingValues['reminder'];
	state: readonly ReminderState[];
};

export type TrackingNoticeSession = Pick<Session, 'id' | 'start_at' | 'start_tz'> & {
	end_at?: number | null;
	work_item_name: string | null;
};
export type TrackingNotice = {
	session_id: string;
	notification: { title: string; body: string; tag: string; navigate: '/' };
};
export type TrackingNoticeInput = {
	sessions: readonly TrackingNoticeSession[];
	setting: SettingValues['tracking_notice'];
	sent_session_ids: readonly string[];
};

/** Decide which running sessions need their one-time tracking notice. */
export function trackingNotices(input: TrackingNoticeInput, now: number): TrackingNotice[] {
	if (!input.setting.enabled) return [];
	const sent = new Set(input.sent_session_ids);
	return input.sessions
		.filter((session) => session.end_at == null && session.start_at <= now && !sent.has(session.id))
		.sort((a, b) => a.start_at - b.start_at || a.id.localeCompare(b.id))
		.map((session) => {
			let timeZone = session.start_tz || 'UTC';
			try {
				timeZone = new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone;
			} catch {
				timeZone = 'UTC';
			}
			const time = new Intl.DateTimeFormat('en-US', {
				timeZone,
				hour: 'numeric',
				minute: '2-digit',
			}).format(session.start_at);
			return {
				session_id: session.id,
				notification: {
					title: 'Tracking',
					body: `${session.work_item_name || 'Untitled session'} since ${time}`,
					tag: `session:${session.id}`,
					navigate: '/',
				},
			};
		});
}

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** Keep at most 80 name code points, cutting only between whole graphemes. */
function notificationName(name: string | null): string {
	let bounded = '';
	let codePoints = 0;
	for (const { segment } of graphemes.segment(name || 'Untitled session')) {
		codePoints += [...segment].length;
		if (codePoints > 80) return bounded + '…';
		bounded += segment;
	}
	return bounded;
}

/** Pure decision over running sessions; oldest first so the send budget has a stable order. */
export function dueReminders(input: ReminderInput, now: number): DueReminder[] {
	const { sessions, setting } = input;
	if (!setting.enabled) return [];
	const state = new Map(input.state.map((row) => [row.session_id, row]));
	return sessions
		.filter((session) => {
			if (!session.remind || now - session.start_at < setting.threshold_min * 60_000) return false;
			const previous = state.get(session.id);
			return (
				!previous ||
				(setting.repeat_min !== null && now - previous.last_sent_at >= setting.repeat_min * 60_000)
			);
		})
		.sort((a, b) => a.start_at - b.start_at || a.id.localeCompare(b.id))
		.map((session) => ({
			session_id: session.id,
			notification: {
				title: 'Still working?',
				body: `${notificationName(session.work_item_name)} has been running for ${formatHours(Math.max(0, Math.floor((now - session.start_at) / 60_000)), 'hm')}.`,
				navigate: `/?check=${session.id}`,
			},
		}));
}
