import 'fake-indexeddb/auto';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
	DEFAULT_ACTIVITY_TYPES,
	ENTITIES,
	newId,
	parseBackup,
	serializeBackup,
} from '@hourtrail/core';
import type { LocalFix as CoreLocalFix } from '@hourtrail/core';
import { openDb } from '$lib/db/schema';
import type { HourtrailDB, LocalFix } from '$lib/db/schema';
import { backupNudge } from './index';
import { deliverBackup, readBackup } from './export';

const databases: HourtrailDB[] = [];
afterEach(async () => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	await Promise.all(databases.splice(0).map((db) => db.delete()));
});

it('keeps core and database local fix shapes assignable in both directions', () => {
	expectTypeOf<CoreLocalFix>().toExtend<LocalFix>();
	expectTypeOf<LocalFix>().toExtend<CoreLocalFix>();
});

it('nudges only when missing or strictly older than 30 days', () => {
	const now = 40 * 24 * 60 * 60_000;
	const threshold = now - 30 * 24 * 60 * 60_000;
	expect(backupNudge(null, now)).toBe('missing');
	expect(backupNudge(threshold - 1, now)).toBe('stale');
	expect(backupNudge(threshold, now)).toBe('none');
	expect(backupNudge(threshold + 1, now)).toBe('none');
	expect(backupNudge(now, now)).toBe('none');
	expect(backupNudge(now + 1, now)).toBe('none');
	expect(backupNudge(0, now)).toBe('stale');
});

it('exports every entity and local GPS without exporting the outbox or local preferences', async () => {
	const db = openDb(`backup-${newId()}`);
	databases.push(db);
	await db.activity_type.bulkPut([...DEFAULT_ACTIVITY_TYPES]);
	await db.local.bulkPut([
		{ key: 'device_id', value: 'device-a' },
		{ key: 'device_name', value: 'Phone 📱' },
		{ key: 'theme', value: 'dark' },
		{ key: 'last_backup_at', value: 100 },
	]);
	const common = { rev: 0, created_at: 0, updated_at: 0, deleted_at: null, updated_by: 'device-a' };
	await db.setting.put({ ...common, id: 'reporting_tz', value: 'America/New_York' });
	await db.project.put({
		...common,
		id: newId(),
		name: '库存管理系统开发',
		archived_at: null,
		deleted_at: 200,
	});
	const sessionId = newId();
	const fix: LocalFix = {
		id: `${sessionId}:start`,
		session_id: sessionId,
		kind: 'start',
		lat: 44,
		lng: -63,
		accuracy_m: 20,
		captured_at: 200,
	};
	await db.local_fix.put(fix);
	const { backup, tz } = await readBackup(db, 300);
	expect(tz).toBe('America/New_York');
	expect(backup.device).toEqual({ id: 'device-a', name: 'Phone 📱' });
	expect(backup.exported_at).toBe(300);
	for (const entity of ENTITIES)
		expect(backup.records[entity]).toEqual(await db.entity(entity).toArray());
	expect(backup.local_fixes).toEqual([fix]);
	expect(Object.keys(backup.records)).toEqual([...ENTITIES]);
	expect(parseBackup(serializeBackup(backup))).toEqual({ ok: true, file: backup });
	expect((await db.local.get('last_backup_at'))?.value).toBe(100);
});

describe('backup delivery', () => {
	const file = new File(['库存管理系统开发'], 'hourtrail-backup-2026-11-12.json', {
		type: 'application/json',
	});

	it.each([
		{ userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 1 },
		{ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 },
	])('shares files on Apple mobile devices: %j', async (device) => {
		const share = vi.fn().mockResolvedValue(undefined);
		const canShare = vi.fn().mockReturnValue(true);
		vi.stubGlobal('navigator', { ...device, share, canShare });
		expect(await deliverBackup(file)).toBe(true);
		expect(canShare).toHaveBeenCalledWith({ files: [file] });
		expect(share).toHaveBeenCalledWith({ files: [file] });
	});

	it('treats cancellation as unsaved, and propagates other share errors', async () => {
		const share = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
		vi.stubGlobal('navigator', { userAgent: 'iPad', canShare: () => true, share });
		expect(await deliverBackup(file)).toBe(false);
		share.mockRejectedValue(new Error('Share failed'));
		await expect(deliverBackup(file)).rejects.toThrow('Share failed');
	});

	it.each([
		{ userAgent: 'Desktop', canShare: () => true },
		{ userAgent: 'iPhone', canShare: () => false },
		{ userAgent: 'iPad' },
	])('downloads through an object URL when file sharing is unavailable: %j', async (device) => {
		vi.useFakeTimers();
		const share = vi.fn();
		vi.stubGlobal('navigator', { ...device, share });
		const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
		const append = vi.fn();
		vi.stubGlobal('document', { createElement: () => anchor, body: { append } });
		const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:backup');
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		expect(await deliverBackup(file)).toBe(true);
		expect(create).toHaveBeenCalledWith(file);
		expect(anchor.download).toBe(file.name);
		expect(anchor.href).toBe('blob:backup');
		expect(append).toHaveBeenCalledWith(anchor);
		expect(anchor.click).toHaveBeenCalledOnce();
		expect(anchor.remove).toHaveBeenCalledOnce();
		expect(share).not.toHaveBeenCalled();
		expect(revoke).not.toHaveBeenCalled();
		await vi.runAllTimersAsync();
		expect(revoke).toHaveBeenCalledWith('blob:backup');
	});
});
