import { apiErrorBodySchema } from '@hourtrail/core';

type ResponseSchema<T> = { parse(value: unknown): T };

export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
		public details?: Record<string, unknown>,
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export class OfflineError extends Error {
	constructor() {
		super("You're offline. Sign in when you have a connection.");
		this.name = 'OfflineError';
	}
}

export async function apiFetch<T>(
	path: string,
	options: { method?: string; body?: unknown; schema: ResponseSchema<T> },
): Promise<T> {
	let response: Response;
	try {
		response = await fetch(path, {
			method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
			credentials: 'same-origin',
			headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
			body: options.body === undefined ? undefined : JSON.stringify(options.body),
		});
	} catch {
		throw new OfflineError();
	}
	if (!response.ok) {
		try {
			const parsed = apiErrorBodySchema.parse(await response.json());
			throw new ApiError(
				response.status,
				parsed.error.code,
				parsed.error.message,
				parsed.error.details,
			);
		} catch (error) {
			if (error instanceof ApiError) throw error;
			throw new ApiError(response.status, 'internal', 'The request could not be completed.');
		}
	}
	return options.schema.parse(response.status === 204 ? undefined : await response.json());
}
