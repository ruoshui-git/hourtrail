import { apiHeaders } from './security';

export interface Env {
	ASSETS: Fetcher;
}

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: apiHeaders() });
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
			if (url.pathname === '/api/health' && request.method === 'GET') {
				return json(200, { ok: true, time: Date.now() });
			}
			return json(404, { error: { code: 'not_found', message: 'No such endpoint.' } });
		}
		// Static assets (with SPA fallback) are normally served before the Worker runs;
		// this covers anything routed here anyway.
		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
