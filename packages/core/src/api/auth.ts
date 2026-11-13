import { z } from 'zod';
import { epochSchema, uuidSchema } from '../schema/common';

function normalizeBase32(input: string): string {
	return input.trim().toUpperCase().replace(/[\s-]/g, '');
}

function decodeBase32(input: string, length: number): string | null {
	const code = input.replace(/O/g, '0').replace(/[IL]/g, '1');
	return code.length === length && /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]+$/.test(code) ? code : null;
}

export function normalizeAccountKey(input: string): string | null {
	const raw = normalizeBase32(input);
	// Strip the prefix only from a prefixed key (35 characters): a key body may itself start with HT1.
	const key = decodeBase32(raw.length === 35 && raw.startsWith('HT1') ? raw.slice(3) : raw, 32);
	return key === null ? null : `HT1-${key}`;
}

export function normalizeLinkCode(input: string): string | null {
	return decodeBase32(normalizeBase32(input), 8);
}

export function formatLinkCode(code: string): string {
	return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export const deviceNameSchema: z.ZodString = z
	.string()
	.trim()
	.refine((name) => [...name].length >= 1 && [...name].length <= 60, 'Expected 1–60 characters');

export const enrollRequestSchema = z.strictObject({
	account_key: z.string(),
	device_id: uuidSchema,
	device_name: deviceNameSchema,
});
export const linkFinishRequestSchema = z.strictObject({
	code: z.string(),
	device_id: uuidSchema,
	device_name: deviceNameSchema,
});
export const linkStartResponseSchema = z.strictObject({
	code: z.string().regex(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/),
	expires_at: epochSchema,
});
export const deviceInfoSchema = z.strictObject({
	id: uuidSchema,
	name: deviceNameSchema,
	created_at: epochSchema,
	last_seen_at: epochSchema,
	current: z.boolean(),
});
export const sessionResponseSchema = z.strictObject({
	device: deviceInfoSchema,
	server_time: epochSchema,
});
export const devicesResponseSchema = z.strictObject({ devices: z.array(deviceInfoSchema) });

export type EnrollRequest = z.infer<typeof enrollRequestSchema>;
export type LinkFinishRequest = z.infer<typeof linkFinishRequestSchema>;
export type LinkStartResponse = z.infer<typeof linkStartResponseSchema>;
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type DevicesResponse = z.infer<typeof devicesResponseSchema>;
