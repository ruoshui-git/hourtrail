export type ReminderSetting = {
	enabled: boolean;
	threshold_min: number;
	repeat_min: number | null;
};
export type ReminderSession = {
	id: string;
	start_at: number;
	end_at: number | null;
	type_id: string;
};

export function defaultReminderEnd(startAt: number, thresholdMin: number, now: number): number {
	return Math.max(startAt, Math.min(now, startAt + thresholdMin * 60_000));
}

export function shouldPromptReminder(input: {
	session: ReminderSession;
	setting: ReminderSetting;
	typeReminds: boolean;
	dismissedAt: number | null;
	now: number;
}): boolean {
	const { session, setting, typeReminds, dismissedAt, now } = input;
	if (!setting.enabled || !typeReminds || session.end_at !== null) return false;
	if (now - session.start_at < setting.threshold_min * 60_000) return false;
	if (dismissedAt === null) return true;
	return setting.repeat_min !== null && now - dismissedAt >= setting.repeat_min * 60_000;
}

export function parseReminderPush(value: unknown): {
	notification: { title: string; body: string; navigate: string };
} | null {
	if (!value || typeof value !== 'object') return null;
	const notification = (value as { notification?: unknown }).notification;
	if (!notification || typeof notification !== 'object') return null;
	const record = notification as Record<string, unknown>;
	if (
		typeof record.title !== 'string' ||
		typeof record.body !== 'string' ||
		typeof record.navigate !== 'string' ||
		!record.navigate.startsWith('/') ||
		record.navigate.startsWith('//')
	)
		return null;
	return { notification: { title: record.title, body: record.body, navigate: record.navigate } };
}

type NotificationClient = {
	navigate(url: string): Promise<unknown>;
	focus(): Promise<unknown>;
};
export type ReminderWorkerScope = {
	location: { origin: string };
	registration: {
		showNotification(
			title: string,
			options: { body: string; data: { navigate: string } },
		): Promise<void>;
	};
	clients: {
		matchAll(options: { type: 'window'; includeUncontrolled: true }): Promise<NotificationClient[]>;
		openWindow(url: string): Promise<unknown>;
	};
	addEventListener(
		type: 'push',
		listener: (event: {
			data?: { json(): unknown };
			waitUntil(promise: Promise<unknown>): void;
		}) => void,
	): void;
	addEventListener(
		type: 'notificationclick',
		listener: (event: {
			notification: { data?: { navigate?: unknown }; close(): void };
			waitUntil(promise: Promise<unknown>): void;
		}) => void,
	): void;
};

export function registerReminderHandlers(scope: ReminderWorkerScope): void {
	scope.addEventListener('push', (event) => {
		const payload = parseReminderPush(event.data?.json());
		if (!payload) return;
		event.waitUntil(
			scope.registration.showNotification(payload.notification.title, {
				body: payload.notification.body,
				data: { navigate: payload.notification.navigate },
			}),
		);
	});

	scope.addEventListener('notificationclick', (event) => {
		event.notification.close();
		const path = event.notification.data?.navigate;
		const target = new URL(typeof path === 'string' ? path : '/', scope.location.origin).href;
		event.waitUntil(
			scope.clients
				.matchAll({ type: 'window', includeUncontrolled: true })
				.then(async (clients) => {
					const windowClient = clients[0];
					if (windowClient) {
						await windowClient.navigate(target);
						return windowClient.focus();
					}
					return scope.clients.openWindow(target);
				}),
		);
	});
}
