import {
	headingLabel,
	reportConfigSchema,
	report,
	resolveRange,
	HEADING_KEYS,
	type ActivityType,
	type Day,
	type HeadingKey,
	type Report,
	type ReportConfig,
	type ReportData,
	type ReportRow,
	type RelativeRange,
} from '@hourtrail/core';
import { customProblem } from '$lib/features/reports/domain';

export type RangeChoice = RelativeRange | 'custom';
/** Form fields hold the strings the controls give back; formConfig parses them. */
export type ReportForm = {
	title: string;
	rangeChoice: string;
	customFrom: Day;
	customTo: Day;
	/** null means every type is included; otherwise the checked type ids. */
	typeIds: string[] | null;
	group_by: string;
	show_sessions: boolean;
	show_notes: boolean;
	hours_format: string;
	excluded: string[];
	/** Every heading key; an empty string means the English default. */
	headings: Record<HeadingKey, string>;
};

export const DEFAULT_TITLE = 'Work report';
const GROUPS: ReportConfig['group_by'][] = ['work_item', 'project', 'day', 'type'];

export function emptyHeadings(): Record<HeadingKey, string> {
	return Object.fromEntries(HEADING_KEYS.map((key) => [key, ''])) as Record<HeadingKey, string>;
}

export function defaultForm(): ReportForm {
	return {
		title: DEFAULT_TITLE,
		rangeChoice: 'this_month',
		customFrom: '',
		customTo: '',
		typeIds: null,
		group_by: 'work_item',
		show_sessions: true,
		show_notes: true,
		hours_format: 'hm',
		excluded: [],
		headings: emptyHeadings(),
	};
}

export function parseRange(value: string): RangeChoice {
	return value === 'this_month' || value === 'last_month' || value === 'this_week'
		? value
		: 'custom';
}

/** The config a form stands for today. Relative choices store the period they cover now. */
export function formConfig(
	form: ReportForm,
	today: Day,
	weekStartsOn: 1 | 2 | 3 | 4 | 5 | 6 | 7,
): { config: ReportConfig } | { problem: string } {
	const choice = parseRange(form.rangeChoice);
	const relative = choice === 'custom' ? null : choice;
	if (relative === null) {
		const problem = customProblem(form.customFrom, form.customTo);
		if (problem !== null) return { problem };
	}
	// The stored range is the period now, so older readers still see real dates.
	const stored =
		relative === null
			? { from: form.customFrom, to: form.customTo }
			: resolveRange(
					{ range: { from: today, to: today }, relative_range: relative },
					today,
					weekStartsOn,
				);
	const headings = Object.fromEntries(
		Object.entries(form.headings).filter(([, text]) => text !== ''),
	);
	const parsed = reportConfigSchema.safeParse({
		title: form.title.trim() === '' ? DEFAULT_TITLE : form.title,
		range: stored,
		relative_range: relative,
		type_ids: form.typeIds,
		group_by: GROUPS.find((group) => group === form.group_by) ?? 'work_item',
		show_sessions: form.show_sessions,
		show_notes: form.show_notes,
		excluded_session_ids: form.excluded,
		headings,
		hours_format: form.hours_format === 'decimal' ? 'decimal' : 'hm',
	});
	if (!parsed.success) return { problem: 'Check the report options.' };
	return { config: parsed.data };
}

/** Loads a saved config into the form. The range of a relative config is resolved by the caller. */
export function formFromConfig(config: ReportConfig): ReportForm {
	const headings = emptyHeadings();
	for (const key of HEADING_KEYS) headings[key] = config.headings[key] ?? '';
	return {
		title: config.title,
		rangeChoice: config.relative_range ?? 'custom',
		customFrom: config.range.from,
		customTo: config.range.to,
		typeIds: config.type_ids,
		group_by: config.group_by,
		show_sessions: config.show_sessions,
		show_notes: config.show_notes,
		hours_format: config.hours_format,
		excluded: [...config.excluded_session_ids],
		headings,
	};
}

/** A stored preset opens only when it still validates; otherwise the caller shows the message. */
export function readPreset(stored: unknown): { ok: true; config: ReportConfig } | { ok: false } {
	const parsed = reportConfigSchema.safeParse(stored);
	return parsed.success ? { ok: true, config: parsed.data } : { ok: false };
}

export type PreviewRow = ReportRow & { excluded: boolean };
export type PreviewGroup = {
	key: string;
	label: string;
	minutes: number;
	rows: PreviewRow[] | null;
};

/**
 * The preview is core's report: totals and groups come from `shown` (excluded sessions
 * removed); session rows come from `all` so excluded ones can stay visible, struck through.
 */
export function previewOf(
	config: ReportConfig,
	data: ReportData,
	now: number,
): { shown: Report; groups: PreviewGroup[] } {
	const shown = report(config, data, { now });
	const all = report({ ...config, excluded_session_ids: [] }, data, { now });
	const excluded = new Set(config.excluded_session_ids);
	const shownGroups = new Map(shown.groups.map((group) => [group.key, group]));
	const groups = all.groups.map((group) => ({
		key: group.key,
		label: group.label,
		minutes: shownGroups.get(group.key)?.minutes ?? 0,
		rows:
			group.rows === null
				? null
				: group.rows.map((row) => ({ ...row, excluded: excluded.has(row.session_id) })),
	}));
	return { shown, groups };
}

/** Headings in form order, with the English default as the placeholder. */
export function headingFields(): { key: HeadingKey; placeholder: string }[] {
	return HEADING_KEYS.map((key) => ({ key, placeholder: headingLabel(key, { headings: {} }) }));
}

export const GROUP_OPTIONS: { value: string; label: string }[] = [
	{ value: 'work_item', label: 'Work item' },
	{ value: 'project', label: 'Project' },
	{ value: 'day', label: 'Day' },
	{ value: 'type', label: 'Type' },
];

/** The range unit that names the period on the printed page. */
export function rangeUnit(choice: string): 'month' | 'week' | 'custom' {
	const parsed = parseRange(choice);
	if (parsed === 'this_week') return 'week';
	return parsed === 'custom' ? 'custom' : 'month';
}

export function typeChoices(types: ActivityType[]): ActivityType[] {
	return types.filter((type) => type.deleted_at === null);
}
