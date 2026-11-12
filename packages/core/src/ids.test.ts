import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import type * as Ids from './ids';

let ids: typeof Ids;
beforeEach(async () => {
	vi.resetModules();
	ids = await import('./ids');
});

describe('UUIDs', () => {
	it('encodes timestamp, version and variant using injectable randomness', () => {
		const random = vi.fn((length: number) => new Uint8Array(length).fill(255));
		const id = ids.newId(0x0123456789ab, random);
		expect(id).toBe('01234567-89ab-7000-bfff-ffffffffffff');
		expect(ids.isUuid(id)).toBe(true);
		expect(ids.idTimestamp(id)).toBe(0x0123456789ab);
		expect(random).toHaveBeenCalledWith(10);
	});

	it('orders 10,000 ids in one millisecond, carrying into the high counter bits', () => {
		const random = vi.fn((length: number) => new Uint8Array(length).fill(255));
		const generated = Array.from({ length: 10_000 }, () => ids.newId(1_800_000_000_000, random));
		expect(new Set(generated).size).toBe(generated.length);
		expect([...generated].sort()).toEqual(generated);
		expect(
			generated.every((id) => ids.isUuid(id) && ids.idTimestamp(id) === 1_800_000_000_000),
		).toBe(true);
		expect(random).toHaveBeenCalledTimes(1);
	});

	it('preserves ordering when the device clock goes backwards', () => {
		const first = ids.newId(100);
		const second = ids.newId(99);
		expect(second > first).toBe(true);
		expect(ids.idTimestamp(second)).toBe(100);
	});

	it('uses Web Crypto and the current time by default', () => {
		const before = Date.now();
		const id = ids.newId();
		expect(ids.isUuid(id)).toBe(true);
		expect(ids.idTimestamp(id)).toBeGreaterThanOrEqual(before);
		expect(ids.idTimestamp(id)).toBeLessThanOrEqual(Date.now());
	});

	it.each([-1, 0.5, NaN, Infinity, 0x1000000000000])('rejects invalid timestamp %s', (now) => {
		expect(() => ids.newId(now)).toThrow(RangeError);
	});

	it('rejects a random source returning the wrong number of bytes', () => {
		expect(() => ids.newId(1, () => new Uint8Array(1))).toThrow(RangeError);
	});

	it('recognizes any lowercase UUID version and only extracts v7 timestamps', () => {
		for (const id of [
			'00000000-0000-0000-0000-000000000000',
			'ffffffff-ffff-ffff-ffff-ffffffffffff',
			'550e8400-e29b-41d4-a716-446655440000',
		]) {
			expect(ids.isUuid(id)).toBe(true);
			expect(ids.idTimestamp(id)).toBeNull();
		}
		for (const invalid of [null, 1, {}, '', '550E8400-e29b-41d4-a716-446655440000']) {
			expect(ids.isUuid(invalid)).toBe(false);
		}
		expect(ids.idTimestamp('00000000-0000-7000-0000-000000000001')).toBeNull();
		expect(ids.idTimestamp('not-an-id')).toBeNull();
	});

	it('orders ids for increasing timestamps (500 property runs)', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.uniqueArray(fc.integer({ min: 0, max: 0xffffffffffff }), {
					minLength: 2,
					maxLength: 50,
				}),
				async (timestamps) => {
					vi.resetModules();
					const fresh = await import('./ids');
					const ordered = timestamps.sort((a, b) => a - b);
					const generated = ordered.map((now) => fresh.newId(now, (n) => new Uint8Array(n)));
					expect(generated.map((id) => fresh.idTimestamp(id))).toEqual(ordered);
					expect(generated.every((id) => fresh.isUuid(id))).toBe(true);
					for (let i = 1; i < generated.length; i++) {
						expect(generated[i]! > generated[i - 1]!).toBe(true);
					}
				},
			),
			{ numRuns: 500 },
		);
	});
});
