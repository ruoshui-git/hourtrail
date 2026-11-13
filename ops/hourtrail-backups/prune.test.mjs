import test from 'node:test';
import assert from 'node:assert/strict';
import { keepDumpNames } from './prune.mjs';

test('keeps 60 newest dailies plus first dump of every month', () => {
	const names = [];
	const start = Date.UTC(2026, 0, 1);
	for (let day = 0; day < 100; day++)
		names.push(`hourtrail-${new Date(start + day * 86400000).toISOString().slice(0, 10)}.sql.age`);
	const keep = keepDumpNames(names);
	assert.equal(keep.size, 62);
	for (let day = 40; day < 100; day++) assert.ok(keep.has(names[day]));
	for (const day of [0, 31, 59, 90]) assert.ok(keep.has(names[day]));
});
