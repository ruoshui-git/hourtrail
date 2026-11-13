import { z } from 'zod';

export const API_ERROR_CODES = [
	'invalid_request',
	'unauthorized',
	'forbidden_origin',
	'not_found',
	'method_not_allowed',
	'payload_too_large',
	'unsupported_media_type',
	'locked',
	'conflict_retry',
	'internal',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
export type ApiErrorBody = {
	error: { code: ApiErrorCode; message: string; details?: Record<string, unknown> };
};

export const apiErrorBodySchema: z.ZodType<ApiErrorBody> = z.strictObject({
	error: z.strictObject({
		code: z.enum(API_ERROR_CODES),
		message: z.string(),
		details: z.record(z.string(), z.unknown()).optional(),
	}),
});
