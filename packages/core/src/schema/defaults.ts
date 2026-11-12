import type { ActivityType } from './records';

export const WORK_TYPE_ID = '00000000-0000-7000-8000-000000000001';
export const OVERHEAD_TYPE_ID = '00000000-0000-7000-8000-000000000002';
export const VOLUNTEER_TYPE_ID = '00000000-0000-7000-8000-000000000003';
export const PERSONAL_TYPE_ID = '00000000-0000-7000-8000-000000000004';

const common = {
	rev: 0,
	created_at: 0,
	updated_at: 0,
	deleted_at: null,
	archived_at: null,
};

export const DEFAULT_ACTIVITY_TYPES: ActivityType[] = [
	{
		...common,
		id: WORK_TYPE_ID,
		name: 'Work',
		color: 'lake',
		counts_as_work: true,
		remind: true,
		sort_key: 1,
	},
	{
		...common,
		id: OVERHEAD_TYPE_ID,
		name: 'Overhead',
		color: 'rose',
		counts_as_work: false,
		remind: true,
		sort_key: 2,
	},
	{
		...common,
		id: VOLUNTEER_TYPE_ID,
		name: 'Volunteer',
		color: 'saffron',
		counts_as_work: false,
		remind: true,
		sort_key: 3,
	},
	{
		...common,
		id: PERSONAL_TYPE_ID,
		name: 'Personal',
		color: 'fern',
		counts_as_work: false,
		remind: false,
		sort_key: 4,
	},
];

/** Defaults applied when creating records (schemas require every field to be present). */
export const NEW_WORK_ITEM_TYPE_ID = WORK_TYPE_ID;
export const DEFAULT_PLACE_RADIUS_M = 100;
