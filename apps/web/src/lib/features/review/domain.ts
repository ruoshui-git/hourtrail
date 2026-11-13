import type { ReviewIssue } from '@hourtrail/core';

export type ReviewGroups = { open: ReviewIssue[]; done: ReviewIssue[] };

export function groupReviewIssues(issues: ReviewIssue[]): ReviewGroups {
	return {
		open: issues.filter((issue) => issue.state === 'open'),
		done: issues.filter((issue) => issue.state !== 'open'),
	};
}

export function reviewFixLabel(kind: ReviewIssue['kind']): string | null {
	const labels: Record<ReviewIssue['kind'], string | null> = {
		'running-long': 'Edit times',
		'two-running': null,
		untitled: 'Name it',
		'no-note': 'Add a note',
		place: 'Choose place',
		overlap: 'Edit times',
		'suspect-time': 'Edit times',
		gap: 'Add session',
		conflict: 'Resolve conflict',
	};
	return labels[kind];
}

export function conflictWording(
	field: string,
	current: unknown,
	other: unknown,
	formatValue: (field: string, value: unknown) => string = (_field, value) => String(value),
): string {
	const label = field === 'end_at' ? 'End time' : field === 'start_at' ? 'Start time' : field;
	return `${label} was set on two devices: ${formatValue(field, current)} here, ${formatValue(field, other)} on the other device.`;
}
