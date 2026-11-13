import { describe, expect, it } from 'vitest';
import { batchSchema } from '@hourtrail/core';
import { warmPushPath, warmupBatch } from '../src/warmup';

describe('push warm-up', () => {
	it('uses a batch the real schema accepts, so the warm-up is never silently a no-op', () => {
		expect(batchSchema.safeParse(warmupBatch).success).toBe(true);
		expect(warmPushPath()).toBe(true);
	});
});
