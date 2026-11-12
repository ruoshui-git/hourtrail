// Print changed paths that match neither the brief's `owned` globs nor any extra glob.
// Usage: node scope.mjs BRIEF "CHANGED_PATHS_NEWLINE_SEPARATED" [EXTRA_GLOB...]
import { readFileSync } from 'node:fs';
import { matchesGlob } from 'node:path';
import { readFrontMatter } from './frontmatter.mjs';

const [brief, changed = '', ...extra] = process.argv.slice(2);
const owned = [].concat(readFrontMatter(readFileSync(brief, 'utf8')).owned ?? []);
const globs = [...owned, ...extra];
for (const path of changed.split('\n').filter(Boolean)) {
	if (!globs.some((glob) => path === glob || matchesGlob(path, glob))) console.log(path);
}
