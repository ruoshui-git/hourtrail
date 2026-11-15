import { describe, expect, it, vi } from 'vitest';
import { shouldShowAppBadge, updateTrackingIndicators } from './domain';

describe('tracking indicators', () => {
	it('requires a running session and granted notification permission for the badge', () => {
		expect(shouldShowAppBadge(true, 'granted')).toBe(true);
		expect(shouldShowAppBadge(false, 'granted')).toBe(false);
		expect(shouldShowAppBadge(true, 'default')).toBe(false);
	});
	it('sets the badge while running and ignores API errors', async () => {
		const setAppBadge = vi.fn().mockRejectedValue(new Error('unsupported'));
		await expect(
			updateTrackingIndicators(['one'], {
				notificationsPermission: 'granted',
				client: { setAppBadge },
			}),
		).resolves.toBeUndefined();
		expect(setAppBadge).toHaveBeenCalledWith(1);
	});
	it('closes tracking notifications, preserves reminders, and clears the badge when stopped', async () => {
		const tracking = { tag: 'session:one', close: vi.fn() };
		const reminder = { tag: 'reminder:one', close: vi.fn() };
		const clearAppBadge = vi.fn();
		const getNotifications = vi.fn().mockResolvedValue([tracking, reminder]);
		await updateTrackingIndicators([], {
			notificationsPermission: 'granted',
			client: { clearAppBadge },
			serviceWorker: { ready: Promise.resolve({ getNotifications }) },
		});
		expect(getNotifications).toHaveBeenCalledOnce();
		expect(tracking.close).toHaveBeenCalledOnce();
		expect(reminder.close).not.toHaveBeenCalled();
		expect(clearAppBadge).toHaveBeenCalledOnce();
	});
	it('does not call badge APIs without permission', async () => {
		const client = { setAppBadge: vi.fn(), clearAppBadge: vi.fn() };
		await updateTrackingIndicators(['one'], { notificationsPermission: 'denied', client });
		expect(client.setAppBadge).not.toHaveBeenCalled();
		expect(client.clearAppBadge).not.toHaveBeenCalled();
	});
	it('after a Switch, closes the previous session notice and keeps the running one', async () => {
		const previous = { tag: 'session:old', close: vi.fn() };
		const current = { tag: 'session:new', close: vi.fn() };
		const setAppBadge = vi.fn();
		const getNotifications = vi.fn().mockResolvedValue([previous, current]);
		await updateTrackingIndicators(['new'], {
			notificationsPermission: 'granted',
			client: { setAppBadge },
			serviceWorker: { ready: Promise.resolve({ getNotifications }) },
		});
		expect(previous.close).toHaveBeenCalledOnce();
		expect(current.close).not.toHaveBeenCalled();
		expect(setAppBadge).toHaveBeenCalledWith(1);
	});
});
