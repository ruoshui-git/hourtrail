import { describe, expect, it } from 'vitest';
import { backupHeartbeatSchema, backupStatusSchema } from './backup';

describe('backup API schemas', () => {
	it('accepts heartbeat input with bounded dump name and byte count', () => {
		expect(
			backupHeartbeatSchema.parse({ dump: 'hourtrail-2026-11-13.sql.age', bytes: 42 }),
		).toEqual({
			dump: 'hourtrail-2026-11-13.sql.age',
			bytes: 42,
		});
		expect(backupHeartbeatSchema.safeParse({ dump: 'x'.repeat(201), bytes: 1 }).success).toBe(
			false,
		);
		expect(backupHeartbeatSchema.safeParse({ dump: 'dump', bytes: -1 }).success).toBe(false);
	});

	it('accepts empty and populated backup status', () => {
		expect(backupStatusSchema.parse({ last_nightly_at: null, dump: null })).toEqual({
			last_nightly_at: null,
			dump: null,
		});
		expect(backupStatusSchema.parse({ last_nightly_at: 1, dump: 'dump.sql.age' }).dump).toBe(
			'dump.sql.age',
		);
	});
});
