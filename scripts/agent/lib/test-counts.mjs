// Sum Vitest JSON reports (.vitest-report.json) under a checkout.
//   test-counts.mjs DIR                 -> "N tests, S skipped, F failed"
//   test-counts.mjs --compare FILE DIR  -> compare DIR with a saved line; exit 1 if fewer tests
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function find(dir, out = []) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
		const p = join(dir, e.name);
		if (e.isDirectory()) find(p, out);
		else if (e.name === '.vitest-report.json') out.push(p);
	}
	return out;
}

function count(dir) {
	let total = 0;
	let skipped = 0;
	let failed = 0;
	for (const f of find(dir)) {
		const r = JSON.parse(readFileSync(f, 'utf8'));
		total += r.numTotalTests ?? 0;
		skipped += (r.numPendingTests ?? 0) + (r.numTodoTests ?? 0);
		failed += r.numFailedTests ?? 0;
	}
	return { total, skipped, failed };
}

const fmt = (c) => `${c.total} tests, ${c.skipped} skipped, ${c.failed} failed`;
const parse = (s) => {
	const m = s.match(/(\d+) tests, (\d+) skipped, (\d+) failed/);
	return m ? { total: +m[1], skipped: +m[2], failed: +m[3] } : null;
};

const args = process.argv.slice(2);
if (args[0] === '--compare') {
	const here = count(args[2]);
	const base = existsSync(args[1]) ? parse(readFileSync(args[1], 'utf8')) : null;
	console.log(`   this: ${fmt(here)}`);
	if (!base) {
		console.log('   main: no baseline');
		process.exit(here.failed ? 1 : 0);
	}
	console.log(`   main: ${fmt(base)}`);
	let bad = false;
	if (here.total < base.total) {
		console.log(`   FAIL: ${base.total - here.total} fewer tests than main`);
		bad = true;
	}
	if (here.skipped > base.skipped) {
		console.log(`   FAIL: ${here.skipped - base.skipped} more skipped tests than main`);
		bad = true;
	}
	if (here.failed) bad = true;
	process.exit(bad ? 1 : 0);
}
console.log(fmt(count(args[0])));
