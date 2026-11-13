import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';

async function findDatabase(directory) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			const found = await findDatabase(path);
			if (found) return found;
		} else if (
			entry.isFile() &&
			entry.name.endsWith('.sqlite') &&
			entry.name !== 'metadata.sqlite'
		) {
			return path;
		}
	}
	return null;
}
const databasePath = await findDatabase(process.argv[2]);
if (!databasePath) throw new Error(`No local D1 SQLite file found under ${process.argv[2]}`);
const db = new DatabaseSync(databasePath, { readOnly: true });
const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const quoteValue = (value) => {
	if (value === null) return 'NULL';
	if (typeof value === 'number') return String(value);
	if (typeof value === 'bigint') return String(value);
	if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString('hex')}'`;
	return `'${String(value).replaceAll("'", "''")}'`;
};
const schema = db
	.prepare(
		"SELECT name, sql FROM sqlite_master WHERE type IN ('table', 'index') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name",
	)
	.all();
const statements = ['PRAGMA foreign_keys=OFF;'];
for (const object of schema) statements.push(`${object.sql};`);
for (const { name } of schema.filter((object) => object.sql.startsWith('CREATE TABLE'))) {
	const rows = db.prepare(`SELECT * FROM ${quoteIdentifier(name)}`).all();
	if (!rows.length) continue;
	const columns = Object.keys(rows[0]);
	for (const row of rows) {
		statements.push(
			`INSERT INTO ${quoteIdentifier(name)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${columns.map((column) => quoteValue(row[column])).join(', ')});`,
		);
	}
}
statements.push('PRAGMA foreign_keys=ON;');
writeFileSync(process.argv[3], `${statements.join('\n')}\n`, { mode: 0o600 });
db.close();
