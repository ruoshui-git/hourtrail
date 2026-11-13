import { describe, expect, it } from 'vitest';
import {
	pushKeyResponseSchema,
	pushSubscribeRequestSchema,
	pushUnsubscribeRequestSchema,
} from './push';

const input = {
	endpoint: 'https://push.example/device',
	keys: { p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) },
};

describe('push API contracts', () => {
	it('accepts browser keys with or without base64url padding', () => {
		expect(pushSubscribeRequestSchema.parse(input)).toEqual(input);
		expect(
			pushSubscribeRequestSchema.safeParse({
				...input,
				keys: { p256dh: input.keys.p256dh + '=', auth: input.keys.auth + '==' },
			}).success,
		).toBe(true);
		expect(pushUnsubscribeRequestSchema.parse({ endpoint: input.endpoint })).toEqual({
			endpoint: input.endpoint,
		});
		expect(pushKeyResponseSchema.parse({ public_key: input.keys.p256dh })).toEqual({
			public_key: input.keys.p256dh,
		});
	});
	it.each(['http://push.example/device', '/relative', 'javascript:alert(1)', 'not a URL'])(
		'requires an HTTPS endpoint: %s',
		(endpoint) => {
			expect(pushSubscribeRequestSchema.safeParse({ ...input, endpoint }).success).toBe(false);
			expect(pushUnsubscribeRequestSchema.safeParse({ endpoint }).success).toBe(false);
		},
	);
	it('rejects malformed keys, missing fields and unknown fields', () => {
		for (const value of [
			{},
			{ ...input, device_id: 'other' },
			{ ...input, keys: {} },
			{ ...input, keys: { ...input.keys, p256dh: 'bad' } },
			{ ...input, keys: { ...input.keys, auth: 'bad' } },
			{ ...input, keys: { ...input.keys, unexpected: true } },
		])
			expect(pushSubscribeRequestSchema.safeParse(value).success).toBe(false);
		expect(
			pushUnsubscribeRequestSchema.safeParse({ endpoint: input.endpoint, device_id: 'other' })
				.success,
		).toBe(false);
	});
});
