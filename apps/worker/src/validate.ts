import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from './env';
import { ApiError } from './errors';

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
	const result = schema.safeParse(value);
	if (!result.success) {
		throw new ApiError(400, 'invalid_request', 'The request is not valid.', {
			issues: result.error.issues.slice(0, 20).map((issue) => ({
				path: issue.path.map(String).join('.'),
				message: issue.message,
			})),
		});
	}
	return result.data;
}

export async function parseJson<S extends z.ZodType>(
	c: Context<AppEnv>,
	schema: S,
): Promise<z.infer<S>> {
	let value: unknown;
	try {
		value = await c.req.json();
	} catch {
		throw new ApiError(400, 'invalid_request', 'The request body is not valid JSON.');
	}
	return parse(schema, value);
}

export function parseQuery<S extends z.ZodType>(c: Context<AppEnv>, schema: S): z.infer<S> {
	return parse(schema, c.req.query());
}
