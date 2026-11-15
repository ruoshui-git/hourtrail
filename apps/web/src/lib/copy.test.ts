import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pattern = new RegExp(
	'\\b(?:colour|behaviour|centre|metre|organis|recognis|cancel(?:led|ling|lation)|grey|favourite|licence|analys|labelled(?!by)|travell|modell|catalogue|programme|practise|defence|fulfil|honour|neighbour|flavour|judgement|aluminium|cheque|tyre|kerb|enrol(?:ment)?\\b)\\w*\\b',
	'gi',
);

export function findBritish(text: string): number[] {
	const lines = text.split('\n');
	return lines.flatMap((line, index) => {
		pattern.lastIndex = 0;
		return pattern.test(line) ? [index + 1] : [];
	});
}

function stripComments(source: string): string {
	const preserveLines = (text: string) => text.replace(/[^\n]/g, '');
	return source
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (script) =>
			script
				.replace(/\/\*[\s\S]*?\*\//g, preserveLines)
				.replace(/(^|\s)\/\/.*$/gm, (comment) => preserveLines(comment)),
		)
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, preserveLines)
		.replace(/<!--[\s\S]*?-->/g, preserveLines)
		.replace(/\/\*[\s\S]*?\*\//g, preserveLines)
		.replace(/(^|\s)\/\/.*$/gm, (comment) => preserveLines(comment));
}

describe('American English copy guard', () => {
	it('matches British spellings without rejecting American words', () => {
		expect(findBritish('Choose a colour.')).toEqual([1]);
		expect(findBritish('Use color, center, enroll, canceled, and Colorado.')).toEqual([]);
	});

	it('finds British spellings in user-facing source files', () => {
		const root = resolve(import.meta.dirname, '../../../..');
		const files = [
			...globSync('apps/web/src/**/*.svelte', { cwd: root }),
			...globSync('packages/core/src/{report,export,reminders}/**/*.ts', { cwd: root }),
		].filter((file) => !file.endsWith('.test.ts'));
		const violations = files.flatMap((file) => {
			const content = stripComments(readFileSync(resolve(root, file), 'utf8'));
			return findBritish(content).map((line) => `${file}:${line}`);
		});

		// The API route /api/auth/enroll is a fixed protocol identifier; its American spelling is
		// intentionally unaffected by the `enrol` stem. Keep protocol identifiers out of user copy.
		expect(violations).toEqual([]);
	});
});
