// Minimal front-matter reader for briefs: `key: value` and `key:` + `  - item` lists.
export function readFrontMatter(text) {
	const m = text.match(/^---\n([\s\S]*?)\n---/);
	const out = {};
	if (!m) return out;
	let key = null;
	for (const raw of m[1].split('\n')) {
		const line = raw.replace(/\s+#.*$/, '');
		const item = line.match(/^\s+-\s+(.*)$/);
		if (item && key) {
			if (!Array.isArray(out[key])) out[key] = [];
			out[key].push(unquote(item[1].trim()));
			continue;
		}
		const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
		if (kv) {
			key = kv[1];
			out[key] = kv[2] ? unquote(kv[2].trim()) : [];
		}
	}
	return out;
}

function unquote(s) {
	return s.replace(/^(['"])(.*)\1$/, '$2');
}
