import { describe, expect, it } from 'vitest';
import type { Project, Session, WorkItem } from '@hourtrail/core';
import {
	canDeleteProject,
	projectItemCount,
	projectMonthMinutes,
	validateProjectName,
} from './domain';

const project = (fields: Partial<Project> = {}): Project =>
	({ id: 'p1', name: 'Temple', archived_at: null, deleted_at: null, ...fields }) as Project;
const item = (fields: Partial<WorkItem> = {}): WorkItem =>
	({ id: 'w1', name: 'Work', project_id: 'p1', deleted_at: null, ...fields }) as WorkItem;
const session = (fields: Partial<Session> = {}): Session =>
	({
		id: 's1',
		work_item_id: 'w1',
		start_at: Date.parse('2026-03-31T23:30:00Z'),
		end_at: Date.parse('2026-04-01T00:30:00Z'),
		deleted_at: null,
		...fields,
	}) as Session;

describe('projects domain', () => {
	it('trims names and rejects empty or duplicate active names', () => {
		expect(validateProjectName(' 第1寺院 ', [])).toEqual({ ok: true, name: '第1寺院' });
		expect(validateProjectName('  ', [])).toMatchObject({ ok: false });
		expect(validateProjectName('Temple', [project()])).toEqual({
			ok: false,
			error: 'A project with that name already exists.',
		});
		expect(validateProjectName('Temple', [project()], 'p1')).toEqual({ ok: true, name: 'Temple' });
		expect(validateProjectName('Temple', [project({ archived_at: 1 })])).toEqual({
			ok: true,
			name: 'Temple',
		});
	});

	it('counts non-deleted items, including archived items', () => {
		expect(
			projectItemCount('p1', [
				item(),
				item({ id: 'w2', archived_at: 1 }),
				item({ id: 'w3', deleted_at: 1 }),
			]),
		).toBe(2);
	});

	it('allocates monthly minutes by reporting-zone day and follows item project changes', () => {
		const now = Date.parse('2026-04-15T12:00:00Z');
		expect(projectMonthMinutes('p1', [item()], [session()], 'UTC', now)).toBe(30);
		expect(projectMonthMinutes('p1', [item({ project_id: null })], [session()], 'UTC', now)).toBe(
			0,
		);
		expect(projectMonthMinutes(null, [item({ project_id: null })], [session()], 'UTC', now)).toBe(
			30,
		);
	});

	it('allows deletion only when no live work item references the project', () => {
		expect(canDeleteProject('p1', [item()])).toBe(false);
		expect(canDeleteProject('p1', [item({ archived_at: 1 })])).toBe(false);
		expect(canDeleteProject('p1', [item({ deleted_at: 1 })])).toBe(true);
	});
});
