import { readFileSync } from 'node:fs';

const expected = new Map(
	readFileSync(process.argv[2], 'utf8')
		.trim()
		.split('\n')
		.filter(Boolean)
		.map((line) => line.split('\t')),
);
const raw = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const rows = Array.isArray(raw) ? raw.flatMap((item) => item.results ?? []) : (raw.results ?? []);
const actual = new Map(rows.map((row) => [row.key, String(row.count)]));
const keys = new Set([...expected.keys(), ...actual.keys()]);
console.table(
	[...keys]
		.sort()
		.map((key) => ({ key, expected: expected.get(key) ?? '0', actual: actual.get(key) ?? '0' })),
);
const mismatches = [...keys].filter(
	(key) => (expected.get(key) ?? '0') !== (actual.get(key) ?? '0'),
);
if (mismatches.length) {
	console.error(`Restore count mismatch: ${mismatches.join(', ')}`);
	process.exitCode = 1;
}
