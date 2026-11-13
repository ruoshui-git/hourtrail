import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const tables = [
	'devices',
	'link_codes',
	'meta',
	'push_subscriptions',
	'records',
	'reminder_state',
	'sync_batches',
];

describe('initial D1 migration', () => {
	it('creates all seven STRICT tables without seed rows or triggers', async () => {
		const schema = await env.DB.prepare(
			"SELECT name, strict FROM pragma_table_list WHERE name IN ('devices', 'link_codes', 'meta', 'push_subscriptions', 'records', 'reminder_state', 'sync_batches') ORDER BY name",
		).all();
		expect(schema.results).toEqual(tables.map((name) => ({ name, strict: 1 })));
		for (const table of tables) {
			expect(await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first('count')).toBe(0);
		}
		expect(
			(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all()).results,
		).toEqual([]);
	});

	it('round-trips Chinese data, enforces record keys and permits shared revisions', async () => {
		const insert = env.DB.prepare(
			'INSERT INTO records(entity, id, rev, updated_at, deleted_at, data) VALUES (?, ?, ?, ?, ?, ?)',
		);
		const data = JSON.stringify({
			name: '库存管理系统开发',
			project: '第1寺院',
			task: '修复洗手台',
		});
		await insert.bind('work_item', 'record-1', 1, 1000, null, data).run();
		const row = await env.DB.prepare('SELECT * FROM records WHERE entity = ? AND id = ?')
			.bind('work_item', 'record-1')
			.first();
		expect(row).toEqual({
			entity: 'work_item',
			id: 'record-1',
			rev: 1,
			updated_at: 1000,
			deleted_at: null,
			data,
		});
		await expect(insert.bind('work_item', 'record-1', 2, 2000, null, '{}').run()).rejects.toThrow(
			/UNIQUE constraint failed/,
		);
		await insert.bind('work_item', 'record-2', 1, 1000, null, '{}').run();
		await insert.bind('project', 'record-1', 1, 1000, null, '{}').run();
		expect(
			(await env.DB.prepare('SELECT id FROM records WHERE rev = 1').all()).results,
		).toHaveLength(3);
		const index = await env.DB.prepare(
			"SELECT name FROM pragma_index_info('records_rev') ORDER BY seqno",
		).all();
		expect(index.results).toEqual([{ name: 'rev' }, { name: 'entity' }, { name: 'id' }]);
		await env.DB.prepare('DELETE FROM records').run();
	});

	it('enforces sync sequence and batch id uniqueness and stores replay acknowledgements', async () => {
		const insert = env.DB.prepare(
			'INSERT INTO sync_batches(seq, batch_id, device_id, received_at, ack) VALUES (?, ?, ?, ?, ?)',
		);
		const ack = JSON.stringify({ seq: 1, applied: ['record-1'] });
		await insert.bind(1, 'batch-1', 'device-1', 1000, ack).run();
		await expect(insert.bind(1, 'batch-2', 'device-1', 1000, '{}').run()).rejects.toThrow(
			/UNIQUE constraint failed/,
		);
		await expect(insert.bind(2, 'batch-1', 'device-1', 1000, '{}').run()).rejects.toThrow(
			/UNIQUE constraint failed/,
		);
		expect(
			await env.DB.prepare('SELECT ack FROM sync_batches WHERE batch_id = ?')
				.bind('batch-1')
				.first('ack'),
		).toBe(ack);
		await env.DB.prepare('DELETE FROM sync_batches').run();
	});

	it('enforces foreign keys and integer column types', async () => {
		await expect(
			env.DB.prepare('INSERT INTO link_codes VALUES (?, ?, ?, ?, ?)')
				.bind('code', 'missing', 1000, 2000, null)
				.run(),
		).rejects.toThrow(/FOREIGN KEY constraint failed/);
		await expect(
			env.DB.prepare('INSERT INTO push_subscriptions VALUES (?, ?, ?, ?, ?)')
				.bind('endpoint', 'missing', 'key', 'auth', 1000)
				.run(),
		).rejects.toThrow(/FOREIGN KEY constraint failed/);
		await expect(
			env.DB.prepare('INSERT INTO reminder_state VALUES (?, ?, ?)')
				.bind('session', 'not an integer', 1)
				.run(),
		).rejects.toThrow(/cannot store TEXT value in INTEGER column/);
	});
});
