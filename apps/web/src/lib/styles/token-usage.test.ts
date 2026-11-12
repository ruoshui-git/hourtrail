import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Every var(--ht-…) used anywhere must be defined in tokens.css. Stylelint only
// checks the prefix, so a typo such as --ht-type-display silently fell back to
// body text (found in review of task 1.4).
const src = fileURLToPath(new URL('../..', import.meta.url));
const tokens = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
const defined = new Set([...tokens.matchAll(/(--ht-[\w-]+)\s*:/g)].map((m) => m[1]));

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return files(path);
		return /\.(svelte|css|ts)$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
	});
}

describe('design tokens in use', () => {
	it('references only tokens defined in tokens.css', () => {
		const missing: string[] = [];
		for (const file of files(src)) {
			const text = readFileSync(file, 'utf8');
			for (const m of text.matchAll(/var\(\s*(--ht-[\w-]+)/g)) {
				// Names built at runtime (e.g. --ht-blaze-${key}) are checked by prefix.
				if (m[1]!.endsWith('-')) continue;
				if (!defined.has(m[1]!)) missing.push(`${relative(src, file)}: ${m[1]}`);
			}
		}
		expect(missing).toEqual([]);
	});
});
