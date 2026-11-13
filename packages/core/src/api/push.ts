import { z } from 'zod';

const endpointSchema = z.url({ protocol: /^https$/ });

export const pushSubscribeRequestSchema = z.strictObject({
	endpoint: endpointSchema,
	keys: z.strictObject({
		// Uncompressed P-256 point (65 bytes), and a 16-byte authentication secret.
		p256dh: z.string().regex(/^B[A-Za-z0-9_-]{86}=?$/),
		auth: z.string().regex(/^[A-Za-z0-9_-]{22}(==)?$/),
	}),
});
export const pushUnsubscribeRequestSchema = z.strictObject({ endpoint: endpointSchema });
export const pushKeyResponseSchema = z.strictObject({ public_key: z.string() });

export type PushSubscribeRequest = z.infer<typeof pushSubscribeRequestSchema>;
export type PushUnsubscribeRequest = z.infer<typeof pushUnsubscribeRequestSchema>;
export type PushKeyResponse = z.infer<typeof pushKeyResponseSchema>;
