import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBackup } from '@hourtrail/core';
import Restore from './Restore.svelte';

const restoreRecords = vi.hoisted(() => vi.fn());
vi.mock('$lib/db/app', () => ({ repo: { restoreRecords } }));
const backup = buildBackup({
	records: {
		activity_type: [],
		project: [],
		work_item: [],
		session: [],
		place: [],
		session_fix: [],
		review_mark: [],
		day_review: [],
		setting: [],
		report_preset: [],
		conflict: [],
	},
	localFixes: [],
	exportedAt: Date.UTC(2026, 10, 12, 15, 30),
	device: { id: 'old', name: null },
});
async function choose() {
	const file = new File(['backup'], 'backup.json', { type: 'application/json' });
	Object.defineProperty(file, 'text', { value: async () => JSON.stringify(backup) });
	await fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [file] } });
	await screen.findByRole('radio', { name: 'Replace everything' });
}
beforeEach(() => {
	restoreRecords.mockReset();
});

describe('restore guards', () => {
	it('keeps replacement disabled after a canceled save and resets permission for a newly selected file', async () => {
		const saveBackup = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
		render(Restore, { saveBackup, tz: 'America/New_York' });
		await choose();
		await fireEvent.click(screen.getByRole('radio', { name: 'Replace everything' }));
		const button = screen.getByRole('button', { name: 'Replace everything' });
		const input = screen.getByLabelText('Type replace to confirm') as HTMLInputElement;
		expect(input.disabled).toBe(true);
		await fireEvent.click(screen.getByRole('button', { name: 'Save a backup of this device' }));
		await waitFor(() => expect(saveBackup).toHaveBeenCalledOnce());
		expect(input.disabled).toBe(true);
		expect((button as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.click(screen.getByRole('button', { name: 'Save a backup of this device' }));
		await waitFor(() => expect(input.disabled).toBe(false));
		await fireEvent.input(input, { target: { value: 'replace' } });
		expect((button as HTMLButtonElement).disabled).toBe(false);
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		await choose();
		await fireEvent.click(screen.getByRole('radio', { name: 'Replace everything' }));
		expect((screen.getByLabelText('Type replace to confirm') as HTMLInputElement).disabled).toBe(
			true,
		);
		expect(restoreRecords).not.toHaveBeenCalled();
	});

	it('shows committed progress without a cancel control and then the result', async () => {
		let finish!: () => void;
		restoreRecords.mockImplementation(async (_file, _mode, progress) => {
			progress(500, 1000);
			await new Promise<void>((resolve) => {
				finish = resolve;
			});
			return { added: 1000, skipped: 4, replaced: 0, removed: 0 };
		});
		render(Restore, { saveBackup: async () => true, tz: 'UTC' });
		await choose();
		await fireEvent.click(screen.getByRole('button', { name: "Add what's missing" }));
		await screen.findByText('Restoring… 500 of 1,000');
		expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
		finish();
		await screen.findByText('Added 1,000 records. 4 were already here.');
	});
});
