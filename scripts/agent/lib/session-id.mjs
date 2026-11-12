// Print the Codex session (thread) id from a --json event stream.
import { readFileSync } from 'node:fs';

const text = readFileSync(process.argv[2], 'utf8');
for (const line of text.split('\n')) {
	if (!line.startsWith('{')) continue;
	let ev;
	try {
		ev = JSON.parse(line);
	} catch {
		continue;
	}
	const id = ev.thread_id ?? ev.session_id ?? ev.payload?.session_id ?? ev.msg?.session_id;
	if (typeof id === 'string' && id) {
		console.log(id);
		process.exit(0);
	}
}
process.exit(1);
