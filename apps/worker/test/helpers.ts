import { apiErrorBodySchema, type ApiErrorBody, type ApiErrorCode } from '@hourtrail/core';
import { expect } from 'vitest';
import { apiHeaders } from '../src/security';

export const origin = 'https://hourtrail.example';

export function expectApiHeaders(response: Response): void {
	apiHeaders().forEach((value, name) => expect(response.headers.get(name), name).toBe(value));
	expect(response.headers.get('X-Request-Id')).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
	);
}

export async function expectError(
	response: Response,
	status: number,
	code: ApiErrorCode,
): Promise<ApiErrorBody> {
	expect(response.status).toBe(status);
	expectApiHeaders(response);
	const body = apiErrorBodySchema.parse(await response.json());
	expect(body.error.code).toBe(code);
	return body;
}
