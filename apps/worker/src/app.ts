import { Hono } from 'hono';
import type { AppEnv } from './env';
import { ApiError, errorResponse, onError } from './errors';
import { apiHeadersMiddleware, bodyLimit, requestId, sameOriginJson } from './middleware';
import { auth } from './routes/auth';
import { account } from './routes/account';
import { backup } from './routes/backup';
import { health } from './routes/health';
import { sync } from './routes/sync';

export function createApp(): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use('/api/*', requestId, apiHeadersMiddleware, bodyLimit, sameOriginJson);
	app.onError(onError);
	app.route('/api/health', health);
	app.route('/api/auth', auth);
	app.route('/api/account', account);
	app.route('/api/backup', backup);
	app.route('/api/sync', sync);
	app.notFound((c) => {
		// Ask Hono's router so parameters and nested route groups follow the same
		// matching rules as normal dispatch. Middleware alone does not define a path.
		const methods = new Set(app.routes.map((route) => route.method));
		methods.delete('ALL');
		const allowed = [...methods].filter((method) =>
			app.router.match(method, c.req.path)[0].some(([[, route]]) => route.method === method),
		);
		if (allowed.includes('GET')) allowed.push('HEAD');
		if (allowed.length) {
			const response = errorResponse(
				new ApiError(405, 'method_not_allowed', 'This method is not allowed.'),
			);
			response.headers.set('Allow', allowed.join(', '));
			return response;
		}
		return errorResponse(new ApiError(404, 'not_found', 'No such endpoint.'));
	});
	return app;
}
