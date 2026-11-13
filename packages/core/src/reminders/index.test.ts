import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { dueReminders, type ReminderInput } from './index';

const now = 20_000_000;
const minute = 60_000;
function input(): ReminderInput {
	return {
		sessions: [
			{
				id: 'session',
				start_at: now - 240 * minute,
				remind: true,
				work_item_name: '库存管理系统开发',
			},
		],
		setting: { enabled: true, threshold_min: 240, repeat_min: null },
		state: [],
	};
}

describe('dueReminders', () => {
	it('is due exactly at the threshold, with the specified text and navigation', () => {
		const data = input();
		expect(dueReminders(data, now - 1)).toEqual([]);
		expect(dueReminders(data, now)).toEqual([
			{
				session_id: 'session',
				notification: {
					title: 'Still working?',
					body: '库存管理系统开发 has been running for 4h 0m.',
					navigate: '/?check=session',
				},
			},
		]);
		expect(dueReminders(data, now + 12 * minute + 59_999)[0]!.notification.body).toBe(
			'库存管理系统开发 has been running for 4h 12m.',
		);
	});
	it('sends once when repeats are off, even when last_sent_at is zero', () => {
		const data = input();
		data.state = [{ session_id: 'session', last_sent_at: 0, sent_count: 1 }];
		expect(dueReminders(data, now)).toEqual([]);
	});
	it('repeats exactly at repeat_min and uses last_sent_at, not start_at', () => {
		const data = input();
		data.setting.repeat_min = 30;
		data.state = [{ session_id: 'session', last_sent_at: now, sent_count: 1 }];
		expect(dueReminders(data, now + 30 * minute - 1)).toEqual([]);
		expect(dueReminders(data, now + 30 * minute)).toHaveLength(1);
		expect(dueReminders(data, now - minute)).toEqual([]);
	});
	it('does not remind when disabled or the session type does not remind', () => {
		const data = input();
		data.setting.enabled = false;
		expect(dueReminders(data, now)).toEqual([]);
		data.setting.enabled = true;
		data.sessions = [{ ...data.sessions[0]!, remind: false }];
		expect(dueReminders(data, now)).toEqual([]);
	});
	it.each([null, '', '第1寺院', '修复洗手台'])(
		'uses the work item name or Untitled session: %s',
		(name) => {
			const data = input();
			data.sessions = [{ ...data.sessions[0]!, work_item_name: name }];
			expect(dueReminders(data, now)[0]!.notification.body).toBe(
				`${name || 'Untitled session'} has been running for 4h 0m.`,
			);
		},
	);
	it('sorts longest-running first, ignores unrelated state, and leaves inputs unchanged', () => {
		const data = input();
		data.sessions = [
			data.sessions[0]!,
			{ ...data.sessions[0]!, id: 'older', start_at: now - 300 * minute },
		];
		data.state = [{ session_id: 'other', last_sent_at: now, sent_count: 1 }];
		const before = JSON.stringify(data);
		expect(dueReminders(data, now).map((r) => r.session_id)).toEqual(['older', 'session']);
		expect(JSON.stringify(data)).toBe(before);
	});
	it('handles a sub-hour threshold and future starts', () => {
		const data = input();
		data.setting.threshold_min = 14;
		data.sessions = [{ ...data.sessions[0]!, start_at: now - 14 * minute }];
		expect(dueReminders(data, now)[0]!.notification.body).toContain('14m.');
		expect(dueReminders(data, now - 15 * minute)).toEqual([]);
	});
	it.each([
		['a'.repeat(80), 'a'.repeat(80)],
		['a'.repeat(81), 'a'.repeat(80) + '…'],
		['a'.repeat(79) + '😀z', 'a'.repeat(79) + '😀…'],
		['a'.repeat(74) + '👨‍👩‍👧‍👦z', 'a'.repeat(74) + '…'],
		['a'.repeat(73) + '👨‍👩‍👧‍👦z', 'a'.repeat(73) + '👨‍👩‍👧‍👦…'],
		['a'.repeat(79) + 'e\u0301z', 'a'.repeat(79) + '…'],
		['a' + '\u0301'.repeat(80), '…'],
	])('bounds name code points without splitting graphemes: %s', (name, expected) => {
		const data = input();
		data.sessions = [{ ...data.sessions[0]!, work_item_name: name }];
		expect(dueReminders(data, now)[0]!.notification.body).toBe(
			`${expected} has been running for 4h 0m.`,
		);
	});
	it('keeps the serialized push payload for a 2,000-character Chinese name well below the encryption limit', () => {
		const data = input();
		data.sessions = [
			{
				...data.sessions[0]!,
				id: '019a67c9-8000-7000-8000-000000000001',
				work_item_name: '库'.repeat(2000),
			},
		];
		const reminder = dueReminders(data, now)[0]!;
		expect(reminder.notification.body).toBe(`${'库'.repeat(80)}… has been running for 4h 0m.`);
		const payload = JSON.stringify({ web_push: 8030, notification: reminder.notification });
		expect(Buffer.byteLength(payload, 'utf8')).toBeLessThan(512);
	});
});
