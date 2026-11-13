import { createApp } from './app';
import type { Env } from './env';
import { runReminderCron } from './push/reminder-cron';

export type { Env } from './env';

const app = createApp();

export async function scheduled(controller: ScheduledController, env: Env): Promise<void> {
	await runReminderCron(env, controller.scheduledTime);
}

export default {
	scheduled,
	async fetch(request: Request, env: Env): Promise<Response> {
		const { pathname } = new URL(request.url);
		if (pathname === '/api' || pathname.startsWith('/api/')) {
			return app.fetch(request, env);
		}
		// Static assets (with SPA fallback) are normally served before the Worker runs;
		// this covers anything routed here anyway.
		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
