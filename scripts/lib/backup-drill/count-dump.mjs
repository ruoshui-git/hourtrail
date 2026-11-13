import { readFileSync } from 'node:fs';

const sql = readFileSync(process.argv[2], 'utf8');
const counts = new Map();

function valuesFrom(statement) {
	const valuesAt = statement.search(/\bVALUES\b/i);
	if (valuesAt < 0) return [];
	const values = [];
	let tuple = '';
	let depth = 0;
	let quoted = false;
	for (let i = valuesAt + 6; i < statement.length; i++) {
		const char = statement[i];
		if (quoted) {
			tuple += char;
			if (char === "'" && statement[i + 1] === "'") tuple += statement[++i];
			else if (char === "'") quoted = false;
			continue;
		}
		if (char === "'") {
			quoted = true;
			if (depth) tuple += char;
		} else if (char === '(') {
			depth++;
			if (depth > 1) tuple += char;
		} else if (char === ')') {
			depth--;
			if (depth === 0) {
				values.push(tuple);
				tuple = '';
			} else tuple += char;
		} else if (depth) tuple += char;
		else if (char === ';') break;
	}
	return values;
}

for (const statement of sql.matchAll(
	/INSERT\s+INTO\s+["`[]?([\w]+)["`\]]?\s*\(([^)]*)\)\s*VALUES[\s\S]*?;/gi,
)) {
	const table = statement[1].toLowerCase();
	const columns = statement[2].split(',').map((part) =>
		part
			.trim()
			.replace(/["`[\]]/g, '')
			.toLowerCase(),
	);
	for (const valueTuple of valuesFrom(statement[0])) {
		const fields = valueTuple.split(/,(?=(?:[^']*'[^']*')*[^']*$)/).map((part) => part.trim());
		if (table === 'records') {
			const entity = fields[columns.indexOf('entity')]
				?.replace(/^'(.*)'$/, '$1')
				.replaceAll("''", "'");
			if (entity) counts.set(`records:${entity}`, (counts.get(`records:${entity}`) ?? 0) + 1);
		} else if (table === 'devices' || table === 'sync_batches') {
			counts.set(table, (counts.get(table) ?? 0) + 1);
		}
	}
}
for (const [key, count] of [...counts].sort(([a], [b]) => a.localeCompare(b)))
	console.log(`${key}\t${count}`);
