export function shouldShowAppBadge(running: boolean, permission: string): boolean {
	return running && permission === 'granted';
}

export type TrackingIndicatorClient = {
	setAppBadge?(value?: number): Promise<void> | void;
	clearAppBadge?(): Promise<void> | void;
};
export type TrackingNotification = { tag?: string; close(): void };
export type TrackingNotificationRegistration = {
	getNotifications(): Promise<TrackingNotification[]>;
};
export type TrackingIndicatorEnvironment = {
	notificationsPermission: string;
	client: TrackingIndicatorClient;
	serviceWorker?: { ready: Promise<TrackingNotificationRegistration> };
};

/**
 * Keep the icon badge and tracking notifications in sync with the locally running sessions:
 * badge while anything runs, and close every `session:` notification whose session is no
 * longer running (after Stop, and the old session's notice after a Switch).
 */
export async function updateTrackingIndicators(
	runningIds: readonly string[],
	environment: TrackingIndicatorEnvironment,
): Promise<void> {
	const running = runningIds.length > 0;
	if (environment.serviceWorker) {
		try {
			const registration = await environment.serviceWorker.ready;
			const notifications = await registration.getNotifications();
			const live = new Set(runningIds.map((id) => `session:${id}`));
			for (const notification of notifications) {
				if (notification.tag?.startsWith('session:') && !live.has(notification.tag))
					notification.close();
			}
		} catch {
			// Closing notifications is best effort; reminders have different tags and stay open.
		}
	}
	if (environment.notificationsPermission !== 'granted') return;
	try {
		if (shouldShowAppBadge(running, environment.notificationsPermission))
			await environment.client.setAppBadge?.(1);
		else await environment.client.clearAppBadge?.();
	} catch {
		// Badging is optional and must never delay session writes or app startup.
	}
}
