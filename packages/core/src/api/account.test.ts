import { describe, expect, it } from 'vitest';
import { eraseAccountRequestSchema } from './account';

describe('eraseAccountRequestSchema', () => {
	it('accepts an account key and rejects extra fields', () => {
		expect(eraseAccountRequestSchema.parse({ account_key: 'HT1-example' })).toEqual({
			account_key: 'HT1-example',
		});
		expect(eraseAccountRequestSchema.safeParse({ account_key: '', extra: true }).success).toBe(
			false,
		);
	});
});
