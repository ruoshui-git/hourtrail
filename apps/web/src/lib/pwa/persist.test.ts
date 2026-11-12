import { afterEach, describe, expect, it, vi } from 'vitest';
import { persistenceState, requestPersistence } from './persist';

describe('storage persistence', () => {
	afterEach(() => vi.unstubAllGlobals());
	it('reports the persistence request outcome', async () => {
		vi.stubGlobal('navigator', {
			storage: { persist: async () => true, persisted: async () => false },
		});
		expect(await requestPersistence()).toBe('persisted');
		expect(await persistenceState()).toBe('denied');
	});
	it('reports denied and unsupported', async () => {
		vi.stubGlobal('navigator', { storage: { persist: async () => false } });
		expect(await requestPersistence()).toBe('denied');
		expect(await persistenceState()).toBe('unsupported');
		vi.stubGlobal('navigator', {});
		expect(await requestPersistence()).toBe('unsupported');
	});
});
