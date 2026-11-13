import { describe, expect, it } from 'vitest';
import { pullQuerySchema, pullResponseSchema, pushAckSchema } from './sync';

describe('sync API schemas', () => {
	it('defaults and parses decimal query integers within the paging limits', () => {
		expect(pullQuerySchema.parse({})).toEqual({ since: 0, limit: 500 });
		expect(pullQuerySchema.parse({ since: '10', limit: '1' })).toEqual({ since: 10, limit: 1 });
		for (const value of ['', '-1', '1.5', 'abc', '0x10', 'Infinity', '9007199254740992']) {
			expect(pullQuerySchema.safeParse({ since: value }).success).toBe(false);
		}
		for (const limit of ['0', '501', '2.5']) {
			expect(pullQuerySchema.safeParse({ limit }).success).toBe(false);
		}
	});
	it('checks only the cheap record envelope and preserves unknown record fields', () => {
		const response = {
			records: [{ entity: 'session', record: { id: 'id', rev: 1, note: '库存管理系统开发' } }],
			next_since: 1,
			more: false,
			server_time: 123,
		};
		expect(pullResponseSchema.parse(response)).toEqual(response);
		for (const record of [null, [], { id: 1, rev: 1 }, { id: 'id', rev: 1.5 }]) {
			expect(
				pullResponseSchema.safeParse({ ...response, records: [{ entity: 'session', record }] })
					.success,
			).toBe(false);
		}
		expect(
			pullResponseSchema.safeParse({
				...response,
				records: [{ entity: 'unknown', record: { id: 'id', rev: 1 } }],
			}).success,
		).toBe(false);
	});
	it('requires ack fields and validates rejected mutations and counts', () => {
		const id = '019a67c9-8000-7000-8000-000000000001';
		const ack = {
			batch_id: id,
			seq: 1,
			applied: 0,
			rejected: [{ mutation_id: id, reason: 'Cannot patch a missing record' }],
			server_time: 123,
		};
		expect(pushAckSchema.parse(ack)).toEqual(ack);
		expect(pushAckSchema.safeParse({ ...ack, applied: -1 }).success).toBe(false);
		expect(pushAckSchema.safeParse({ ...ack, rejected: [{}] }).success).toBe(false);
		expect(pushAckSchema.safeParse({ ...ack, server_time: undefined }).success).toBe(false);
	});
});
