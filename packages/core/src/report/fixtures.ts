import { DEFAULT_ACTIVITY_TYPES, WORK_TYPE_ID } from '../schema';
import type { ActivityType, Place, Project, Session, WorkItem } from '../schema';
import { reportConfigSchema } from './config';
import type { ReportConfig } from './config';
import type { ReportData } from './entries';

export const id = (n: number): string =>
	`00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
export const at = (iso: string): number => Date.parse(iso);

export const NOW = at('2026-01-31T12:00:00Z');
export const CUSTOM_TYPE_ID = id(0xc0);
export const PROJECT_A = id(0x10);
export const PROJECT_B = id(0x11);
export const WORK_ITEM_A = id(0x20);
export const WORK_ITEM_B = id(0x21);
export const PLACE_A = id(0x30);

const common = { rev: 1, created_at: 0, updated_at: 0, updated_by: 'device-a', deleted_at: null };

export function session(
	fields: Partial<Session> & Pick<Session, 'id' | 'start_at' | 'end_at'>,
): Session {
	return {
		...common,
		work_item_id: WORK_ITEM_A,
		type_id: WORK_TYPE_ID,
		start_tz: 'UTC',
		end_tz: 'UTC',
		note: '',
		source: 'live',
		place_id: null,
		place_state: 'none',
		place_candidates: [],
		origin_device_id: 'device-a',
		flags: {},
		...fields,
	};
}

export function workItem(fields: Pick<WorkItem, 'id' | 'name'> & Partial<WorkItem>): WorkItem {
	return {
		...common,
		description: '',
		type_id: WORK_TYPE_ID,
		project_id: null,
		place_id: null,
		pinned_at: null,
		pin_sort: 0,
		archived_at: null,
		...fields,
	};
}

export function project(fields: Pick<Project, 'id' | 'name'> & Partial<Project>): Project {
	return { ...common, archived_at: null, ...fields };
}

export function place(fields: Pick<Place, 'id' | 'name'> & Partial<Place>): Place {
	return {
		...common,
		lat: 0,
		lng: 0,
		radius_m: 100,
		description: '',
		archived_at: null,
		...fields,
	};
}

export const customType: ActivityType = {
	...common,
	id: CUSTOM_TYPE_ID,
	name: 'Custom',
	color: 'fern',
	sort_key: 5,
	counts_as_work: true,
	remind: false,
	archived_at: null,
};

export function reportData(fields: Partial<ReportData> = {}): ReportData {
	return {
		sessions: [],
		work_items: [
			workItem({ id: WORK_ITEM_A, name: '库存管理系统开发', project_id: PROJECT_A }),
			workItem({ id: WORK_ITEM_B, name: 'Beta', project_id: null }),
		],
		projects: [
			project({ id: PROJECT_A, name: '第1寺院' }),
			project({ id: PROJECT_B, name: 'Unused' }),
		],
		types: [...DEFAULT_ACTIVITY_TYPES, customType],
		places: [],
		settings: { reporting_tz: 'UTC', week_start: 1 },
		...fields,
	};
}

/** A parsed config, so defaults are applied the same way a saved preset would apply them. */
export function configFor(
	range: { from: string; to: string },
	fields: Record<string, unknown> = {},
): ReportConfig {
	return reportConfigSchema.parse({ range, ...fields });
}
