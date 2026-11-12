// Write apps/web/build/_headers for Workers Static Assets: the security headers plus a
// CSP that allows the SPA shell's inline boot script by hash (so no 'unsafe-inline').
// Runs after the web build (`pnpm build` builds web first, then this package).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const build = join(here, '..', '..', 'web', 'build');

export function inlineScriptHashes(html) {
	const hashes = [];
	for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
		hashes.push('sha256-' + createHash('sha256').update(m[1], 'utf8').digest('base64'));
	}
	return hashes;
}

export function headersFile(hashes, security) {
	const lines = ['/*'];
	for (const [k, v] of Object.entries(security.BASE_SECURITY_HEADERS)) lines.push(`  ${k}: ${v}`);
	lines.push(`  Content-Security-Policy: ${security.contentSecurityPolicy(hashes)}`);
	lines.push('', '/_app/immutable/*', '  Cache-Control: public, max-age=31536000, immutable', '');
	lines.push('/index.html', '  Cache-Control: no-cache', '');
	lines.push('/manifest.webmanifest', '  Cache-Control: no-cache', '');
	lines.push('/service-worker.js', '  Cache-Control: no-cache', '');
	return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	// security.ts is plain TypeScript with no type-only runtime constructs; Node strips types.
	const security = await import(pathToFileURL(join(here, '..', 'src', 'security.ts')).href);
	const html = readFileSync(join(build, 'index.html'), 'utf8');
	const hashes = inlineScriptHashes(html);
	writeFileSync(join(build, '_headers'), headersFile(hashes, security));
	console.log(`wrote ${join(build, '_headers')} (${hashes.length} inline script hash(es))`);
}
