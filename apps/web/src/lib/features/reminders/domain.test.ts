import { describe, expect, it } from 'vitest';
import {
	defaultReminderEnd,
	parseReminderPush,
	registerReminderHandlers,
	shouldPromptReminder,
	type ReminderWorkerScope,
} from './domain';

const session = { id: 's', start_at: 0, end_at: null, type_id: 'work' };
const setting = { enabled: true, threshold_min: 60, repeat_min: null };

describe('reminder decisions', () => {
	it('defaults Stop at to the threshold time clamped between start and now', () => {
		const start = 10_000;
		expect(defaultReminderEnd(start, 120, start + 3 * 60 * 60_000)).toBe(start + 2 * 60 * 60_000);
		expect(defaultReminderEnd(start, 120, start + 60_000)).toBe(start + 60_000);
		expect(defaultReminderEnd(start, 120, start - 60_000)).toBe(start);
	});
	it('prompts an eligible running session only after threshold and respects disable, type, dismissal and repeat', () => {
		const base = { session, setting, typeReminds: true, dismissedAt: null, now: 60 * 60_000 };
		expect(shouldPromptReminder(base)).toBe(true);
		expect(shouldPromptReminder({ ...base, now: base.now - 1 })).toBe(false);
		expect(shouldPromptReminder({ ...base, setting: { ...setting, enabled: false } })).toBe(false);
		expect(shouldPromptReminder({ ...base, typeReminds: false })).toBe(false);
		expect(shouldPromptReminder({ ...base, dismissedAt: 1 })).toBe(false);
		expect(
			shouldPromptReminder({ ...base, setting: { ...setting, repeat_min: 30 }, dismissedAt: 1 }),
		).toBe(true);
	});
	it('accepts only a complete same-origin path push notification', () => {
		expect(
			parseReminderPush({
				notification: { title: 'Still working?', body: 'Long session', navigate: '/?check=s' },
			})?.notification.navigate,
		).toBe('/?check=s');
		expect(
			parseReminderPush({
				notification: { title: 'x', body: 'y', navigate: 'https://example.com' },
			}),
		).toBeNull();
		expect(parseReminderPush(null)).toBeNull();
	});
	it('registers push and click handlers against a fake service worker scope', async () => {
		const listeners = new Map<string, (event: never) => void>();
		const shown: unknown[] = [];
		const navigated: string[] = [];
		let focused = false;
		let closed = false;
		const scope = {
			location: { origin: 'https://hourtrail.test' },
			registration: {
				showNotification: async (...args: unknown[]) => {
					shown.push(args);
				},
			},
			clients: {
				matchAll: async () => [
					{
						navigate: async (url: string) => {
							navigated.push(url);
						},
						focus: async () => {
							focused = true;
						},
					},
				],
				openWindow: async () => undefined,
			},
			addEventListener: (type: string, listener: (event: never) => void) =>
				listeners.set(type, listener),
		} as unknown as ReminderWorkerScope;
		registerReminderHandlers(scope);
		let waited: Promise<unknown> = Promise.resolve();
		listeners.get('push')!({
			data: {
				json: () => ({
					notification: { title: 'Still working?', body: '4h 12m', navigate: '/?check=s' },
				}),
			},
			waitUntil: (promise: Promise<unknown>) => {
				waited = promise;
			},
		} as never);
		await waited;
		expect(shown).toEqual([
			['Still working?', { body: '4h 12m', data: { navigate: '/?check=s' } }],
		]);
		listeners.get('notificationclick')!({
			notification: {
				data: { navigate: '/?check=s' },
				close: () => {
					closed = true;
				},
			},
			waitUntil: (promise: Promise<unknown>) => {
				waited = promise;
			},
		} as never);
		await waited;
		expect(closed).toBe(true);
		expect(navigated).toEqual(['https://hourtrail.test/?check=s']);
		expect(focused).toBe(true);
	});
});
