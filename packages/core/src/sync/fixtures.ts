import type { Mutation } from './mutation';
import type { Project, Session, WorkItem } from '../schema';
import { WORK_TYPE_ID } from '../schema';

export const recordId = '00000000-0000-7000-8000-000000000020';
export const mutationId = '00000000-0000-7000-8000-000000000030';
export const otherMutationId = '00000000-0000-7000-8000-000000000031';
export const unicode = '库存管理系统开发 / 第1寺院 / 修复洗手台 🛠️';
export const common = {
	id: recordId,
	rev: 1,
	created_at: 0,
	updated_at: 100,
	updated_by: 'device-origin',
	deleted_at: null,
};
export const project: Project = { ...common, name: unicode, archived_at: null };
export const workItem: WorkItem = {
	...common,
	name: unicode,
	description: '',
	type_id: WORK_TYPE_ID,
	project_id: null,
	place_id: null,
	pinned_at: null,
	pin_sort: 0,
	archived_at: null,
};
export const session: Session = {
	...common,
	work_item_id: null,
	type_id: WORK_TYPE_ID,
	start_at: 0,
	end_at: null,
	start_tz: 'America/Halifax',
	end_tz: null,
	note: unicode,
	source: 'live',
	place_id: null,
	place_state: 'none',
	place_candidates: [],
	origin_device_id: 'device-origin',
	flags: {},
};
export const ctx = { now: 1000 };
export function patch(overrides: Partial<Mutation> = {}): Mutation {
	return {
		id: mutationId,
		entity: 'project',
		record_id: recordId,
		kind: 'patch',
		fields: { name: { from: unicode, to: 'renamed' } },
		at: 200,
		device_id: 'device-a',
		...overrides,
	};
}
