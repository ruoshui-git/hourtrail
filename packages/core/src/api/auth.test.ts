import { describe, expect, it } from 'vitest';
import {
	deviceInfoSchema,
	deviceNameSchema,
	devicesResponseSchema,
	enrollRequestSchema,
	formatLinkCode,
	linkFinishRequestSchema,
	linkStartResponseSchema,
	normalizeAccountKey,
	normalizeLinkCode,
	sessionResponseSchema,
} from './auth';

const key = 'HT1-0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const id = '019a67c9-8000-7000-8000-000000000001';

describe('account key normalization', () => {
	it('keeps an unprefixed key body that itself starts with HT1', () => {
		const body = 'HT1' + '0'.repeat(29);
		expect(normalizeAccountKey(body)).toBe(`HT1-${body}`);
		expect(normalizeAccountKey(`HT1-${body}`)).toBe(`HT1-${body}`);
	});
	it.each([
		key,
		key.slice(4),
		' ht1-ol23-4567-89ab-cdef-ghjk-mnpq-rstv-wxyz ',
		'ht1 oi23 4567 89ab cdef ghjk mnpq rstv wxyz',
	])('normalizes %s to the canonical key', (input) => {
		expect(normalizeAccountKey(input)).toBe(key);
	});
	it.each(['', 'HT1-', key + '0', key.slice(0, -1), key.replace('Z', 'U'), key.replace('Z', '库')])(
		'rejects malformed key %s',
		(input) => expect(normalizeAccountKey(input)).toBeNull(),
	);
});

describe('link codes', () => {
	it.each(['01234567', ' ol23-4567 ', 'oi23 4567'])('normalizes %s', (input) => {
		expect(normalizeLinkCode(input)).toBe('01234567');
	});
	it.each(['', '1234567', '123456789', '1234567U', 'HT1-01234567', '库1234567'])(
		'rejects %s',
		(input) => {
			expect(normalizeLinkCode(input)).toBeNull();
		},
	);
	it('formats the eight canonical characters into two groups', () => {
		expect(formatLinkCode('01234567')).toBe('0123-4567');
		expect(normalizeLinkCode(formatLinkCode('ABCDEFGH'))).toBe('ABCDEFGH');
	});
});

describe('device names', () => {
	it.each(['第1寺院的手机', '库存管理系统开发', '修复洗手台', '😀'.repeat(60), 'a'.repeat(60)])(
		'accepts Unicode code points: %s',
		(name) => {
			expect(deviceNameSchema.parse(`  ${name}  `)).toBe(name);
		},
	);
	it.each(['', '   ', 'a'.repeat(61), '😀'.repeat(61), '库'.repeat(61)])(
		'rejects empty or overlong names',
		(name) => {
			expect(deviceNameSchema.safeParse(name).success).toBe(false);
		},
	);
});

describe('strict auth contracts', () => {
	const device = { id, name: '第1寺院', created_at: 1, last_seen_at: 2, current: true };
	it('validates request and response shapes and rejects extra fields', () => {
		const cases = [
			[enrollRequestSchema, { account_key: key, device_id: id, device_name: 'Phone' }],
			[linkFinishRequestSchema, { code: '01234567', device_id: id, device_name: 'Phone' }],
			[linkStartResponseSchema, { code: '01234567', expires_at: 3 }],
			[deviceInfoSchema, device],
			[sessionResponseSchema, { device, server_time: 3 }],
			[devicesResponseSchema, { devices: [device] }],
		] as const;
		for (const [schema, value] of cases) {
			expect(schema.safeParse(value).success).toBe(true);
			expect(schema.safeParse({ ...value, unexpected: true }).success).toBe(false);
		}
		expect(
			sessionResponseSchema.safeParse({ device: { ...device, token: 'secret' }, server_time: 3 })
				.success,
		).toBe(false);
	});
	it('rejects invalid ids, names, types and times', () => {
		for (const input of [
			{ account_key: key, device_id: 'bad', device_name: 'Phone' },
			{ account_key: key, device_id: id, device_name: '' },
			{ account_key: 123, device_id: id, device_name: 'Phone' },
		])
			expect(enrollRequestSchema.safeParse(input).success).toBe(false);
		expect(deviceInfoSchema.safeParse({ ...device, current: 1 }).success).toBe(false);
		expect(deviceInfoSchema.safeParse({ ...device, created_at: 1.5 }).success).toBe(false);
		expect(linkStartResponseSchema.safeParse({ code: 'bad', expires_at: 3 }).success).toBe(false);
	});
});
