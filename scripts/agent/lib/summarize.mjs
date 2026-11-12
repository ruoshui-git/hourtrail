// Write the post-run summary for .agent-runs/NAME: report status, changed
// paths, paths outside the brief's `owned` globs, diffstat, and signs of
// weakened tests. Usage: node summarize.mjs NAME
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, matchesGlob } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFrontMatter } from './frontmatter.mjs';

const name = process.argv[2];
const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const run = join(repo, '.agent-runs', name);
const wt = join(repo, '.worktrees', name);

const read = (p, fallback = '') => (existsSync(p) ? readFileSync(p, 'utf8') : fallback);
const git = (...args) => {
	try {
		return execFileSync('git', ['-C', wt, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
	} catch {
		return '';
	}
};

const fm = readFrontMatter(read(join(run, 'brief.orig.md')) || read(join(run, 'brief.md')));
const owned = [].concat(fm.owned ?? []);
const readOnly = [].concat(fm.read_only ?? []);
const exit = read(join(run, 'exit')).trim() || '?';
const session = read(join(run, 'session')).trim() || 'unknown';
const meta = read(join(run, 'meta')).trim();

let report;
try {
	report = JSON.parse(read(join(run, 'report.json')));
} catch {
	report = null;
}

const base = git('merge-base', 'main', 'HEAD').trim() || read(join(run, 'base')).trim();
const tracked = git('diff', '--name-only', base).split('\n').filter(Boolean);
const untracked = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
const changed = [...new Set([...tracked, ...untracked])].sort();

const matchesAny = (p, globs) => globs.some((g) => p === g || matchesGlob(p, g));
const outside = owned.length ? changed.filter((p) => !matchesAny(p, owned)) : [];
const readOnlyHits = changed.filter((p) => matchesAny(p, readOnly));

// Test integrity: removed test cases and newly skipped/focused tests.
const diff = git('diff', '-U0', base, '--', '*.test.ts', '*.spec.ts', 'e2e/**');
const caseRe = /^\s*(?:it|test)(?:\.each\([^)]*\))?\s*\(/;
const skipRe =
	/\b(?:it|test|describe)\.(?:skip|only|todo|fixme)\b|\bx(?:it|describe)\s*\(|test\.fixme\s*\(/;
let removedCases = 0;
let addedCases = 0;
let addedSkips = 0;
for (const line of diff.split('\n')) {
	if (line.startsWith('---') || line.startsWith('+++')) continue;
	if (line.startsWith('-') && caseRe.test(line.slice(1))) removedCases++;
	if (line.startsWith('+') && caseRe.test(line.slice(1))) addedCases++;
	if (line.startsWith('+') && skipRe.test(line.slice(1))) addedSkips++;
}
for (const f of untracked.filter((p) => /\.(test|spec)\.ts$/.test(p))) {
	const text = read(join(wt, f));
	for (const line of text.split('\n')) {
		if (caseRe.test(line)) addedCases++;
		if (skipRe.test(line)) addedSkips++;
	}
}

let stat = git('diff', '--shortstat', base).trim();
if (untracked.length) {
	let lines = 0;
	for (const f of untracked) lines += read(join(wt, f)).split('\n').length;
	stat += `${stat ? '; ' : ''}${untracked.length} new file(s), ${lines} lines`;
}

let usage;
try {
	usage = execFileSync(join(repo, 'scripts', 'agent', 'codex-usage'), { encoding: 'utf8' })
		.split('\n')
		.filter((l) => l.startsWith('5-hour') || l.startsWith('allow'))
		.join('; ');
} catch {
	usage = 'unavailable';
}

const out = [];
out.push(`codex-run ${name}: exit ${exit}, session ${session}`);
if (meta) out.push(meta.replace(/\n/g, '; '));
if (report) {
	out.push(`report: ${report.status}: ${report.summary}`);
	for (const c of report.checks ?? [])
		out.push(`  check ${c.result}: ${c.command}${c.detail ? ` (${c.detail})` : ''}`);
	for (const q of report.questions ?? []) out.push(`  question: ${q}`);
	for (const d of report.deviations ?? []) out.push(`  deviation: ${d}`);
	for (const d of report.docs_notes ?? []) out.push(`  docs note: ${d}`);
} else {
	out.push('report: MISSING or not JSON (see report.json / events.jsonl)');
}
out.push(`changed (${changed.length}): ${stat || 'no changes'}`);
for (const p of changed) out.push(`  ${p}`);
out.push(
	owned.length
		? `outside owned globs: ${outside.length ? outside.join(', ') : 'none'}`
		: 'outside owned globs: brief has no `owned` list',
);
if (readOnlyHits.length) out.push(`READ-ONLY PATHS TOUCHED: ${readOnlyHits.join(', ')}`);
out.push(`tests: +${addedCases} cases, -${removedCases} cases, ${addedSkips} new skip/only/todo`);
if (removedCases || addedSkips) out.push('WARNING: tests removed or skipped; review the test diff');
out.push(`usage after run: ${usage}`);
console.log(out.join('\n'));
