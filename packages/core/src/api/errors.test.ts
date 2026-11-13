import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES, apiErrorBodySchema } from './errors';

describe('API error schema', () => {
	it.each(API_ERROR_CODES)('accepts %s with optional structured details', (code) => {
		const body = { error: { code, message: 'Please try again.' } };
		expect(apiErrorBodySchema.parse(body)).toEqual(body);
		const detailed = { error: { ...body.error, details: { retry_after_s: 60 } } };
		expect(apiErrorBodySchema.parse(detailed)).toEqual(detailed);
	});

	it('rejects unknown codes and missing or non-string messages', () => {
		for (const error of [
			{ code: 'unknown', message: 'Try again.' },
			{ code: 'internal' },
			{ code: 'internal', message: 500 },
		]) {
			expect(apiErrorBodySchema.safeParse({ error }).success).toBe(false);
		}
	});

	it('rejects extra envelope or error fields and non-record details', () => {
		const error = { code: 'internal', message: 'Something went wrong.' };
		for (const body of [
			{ error, stack: 'private' },
			{ error: { ...error, stack: 'private' } },
			{ error: { ...error, details: [] } },
			{ error: { ...error, details: null } },
		]) {
			expect(apiErrorBodySchema.safeParse(body).success).toBe(false);
		}
	});
});
