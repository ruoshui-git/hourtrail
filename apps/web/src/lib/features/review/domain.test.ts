import { describe, expect, it } from 'vitest';
import type { ReviewIssue } from '@hourtrail/core';
import { conflictWording, groupReviewIssues, reviewFixLabel } from './domain';

const issue = (kind: ReviewIssue['kind'], state: ReviewIssue['state']): ReviewIssue => ({
	key: `${kind}:one`,
	kind,
	severity: 'neutral',
	message: kind,
	session_ids: [],
	state,
});

describe('review view model', () => {
	it('groups open issues separately from reviewed and dismissed issues', () => {
		expect(
			groupReviewIssues([
				issue('untitled', 'open'),
				issue('gap', 'reviewed'),
				issue('place', 'dismissed'),
			]),
		).toEqual({
			open: [issue('untitled', 'open')],
			done: [issue('gap', 'reviewed'), issue('place', 'dismissed')],
		});
	});

	it('provides the appropriate fix action for each issue kind', () => {
		expect(reviewFixLabel('untitled')).toBe('Name it');
		expect(reviewFixLabel('no-note')).toBe('Add a note');
		expect(reviewFixLabel('place')).toBe('Choose place');
		expect(reviewFixLabel('overlap')).toBe('Edit times');
		expect(reviewFixLabel('gap')).toBe('Add session');
		expect(reviewFixLabel('conflict')).toBe('Resolve conflict');
		expect(reviewFixLabel('two-running')).toBeNull();
	});

	it('explains both values for time conflicts', () => {
		expect(conflictWording('end_at', 1, 2, (_field, value) => `${value}:00 AM`)).toBe(
			'End time was set on two devices: 1:00 AM here, 2:00 AM on the other device.',
		);
	});
});
