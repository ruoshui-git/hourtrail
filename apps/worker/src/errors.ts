import type { ApiErrorBody, ApiErrorCode } from '@hourtrail/core';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './env';
import { apiHeaders } from './security';

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: ApiErrorCode,
		message: string,
		public readonly details?: Record<string, unknown>,
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export function errorResponse(err: ApiError): Response {
	const body: ApiErrorBody = {
		error: {
			code: err.code,
			message: err.message,
			...(err.details ? { details: err.details } : {}),
		},
	};
	return new Response(JSON.stringify(body), { status: err.status, headers: apiHeaders() });
}

const httpErrors: Partial<Record<number, [ApiErrorCode, string]>> = {
	400: ['invalid_request', 'The request is not valid.'],
	401: ['unauthorized', 'Please sign in again.'],
	403: ['forbidden_origin', 'The request origin is not allowed.'],
	404: ['not_found', 'No such endpoint.'],
	405: ['method_not_allowed', 'This method is not allowed.'],
	413: ['payload_too_large', 'The request body is too large.'],
	415: ['unsupported_media_type', 'The request body must be JSON.'],
	429: ['locked', 'Please try again later.'],
	503: ['conflict_retry', 'Please retry the request.'],
};

export const onError: ErrorHandler<AppEnv> = (err, c) => {
	if (err instanceof ApiError) return errorResponse(err);
	if (err instanceof HTTPException) {
		const mapped = httpErrors[err.status];
		if (mapped) return errorResponse(new ApiError(err.status, ...mapped));
	}
	console.error('API request failed', { requestId: c.var.requestId, error: err });
	return errorResponse(new ApiError(500, 'internal', 'Something went wrong.'));
};
