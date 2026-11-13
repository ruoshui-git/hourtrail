import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

export function keepDumpNames(names, keepDaily = 60) {
	const sorted = names
		.filter((name) => /^hourtrail-\d{4}-\d{2}-\d{2}\.sql\.age$/.test(name))
		.sort()
		.reverse();
	const keep = new Set(sorted.slice(0, keepDaily));
	const months = new Set();
	for (const name of [...sorted].reverse()) {
		const month = name.slice(10, 17);
		if (!months.has(month)) {
			months.add(month);
			keep.add(name);
		}
	}
	return keep;
}

export async function pruneDirectory(directory) {
	const names = await readdir(directory);
	const keep = keepDumpNames(names);
	await Promise.all(
		names
			.filter((name) => name.endsWith('.sql.age') && !keep.has(name))
			.map((name) => rm(join(directory, name))),
	);
	return keep;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
	const root = process.argv[2];
	if (!root) throw new Error('Usage: node prune.mjs <dump directory>');
	for (const year of await readdir(root, { withFileTypes: true })) {
		if (year.isDirectory()) await pruneDirectory(join(root, year.name));
	}
}
