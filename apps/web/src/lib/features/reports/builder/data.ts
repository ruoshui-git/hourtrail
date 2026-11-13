import { readSetting } from '@hourtrail/core';
import type { ReportData, SettingKey } from '@hourtrail/core';
import { db } from '$lib/db/app';

export type PresetRow = { id: string; name: string; config: unknown };

/** Reads Dexie only; settings come from the synced setting rows (tombstones skipped). */
export async function readReportData(): Promise<ReportData> {
	const [sessions, work_items, projects, types, places, settings] = await Promise.all([
		db.session.toArray(),
		db.work_item.toArray(),
		db.project.toArray(),
		db.activity_type.toArray(),
		db.place.toArray(),
		db.setting.toArray(),
	]);
	const stored: Partial<Record<SettingKey, unknown>> = {};
	for (const row of settings) {
		if (row.deleted_at === null) stored[row.id as SettingKey] = row.value;
	}
	const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const reporting = readSetting('reporting_tz', stored.reporting_tz) ?? deviceZone;
	return {
		sessions,
		work_items,
		projects,
		types,
		places,
		settings: { ...stored, reporting_tz: reporting },
	};
}

/** Live presets, oldest name first; tombstones are skipped. */
export async function readPresets(): Promise<PresetRow[]> {
	const rows = await db.report_preset.toArray();
	return rows
		.filter((row) => row.deleted_at === null)
		.map((row) => ({ id: row.id, name: row.name, config: row.config }))
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
