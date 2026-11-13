import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { acquireCloud, releaseCloud } from './helpers/auth';
import { signIn } from './helpers/sync';
import {
	patchScenarioRecord,
	scenarioSnapshot,
	seedRecords,
	unicodeCodePoints,
	unicodeDataset,
	waitForOutbox,
} from './helpers/scenarios';

test.use({ actionTimeout: 15_000 });

test('scenario I: Unicode notes and item names synchronize and export intact', async ({
	browser,
	browserName,
	baseURL,
}) => {
	test.setTimeout(120_000);
	test.skip(
		browserName !== 'chromium',
		'Signed-in sync steps require Chromium Secure-cookie support on http://127.0.0.1.',
	);
	await acquireCloud();
	const suffix = Math.random().toString(36).slice(2, 7);
	const phone = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
	const desktop = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
	const p = await phone.newPage();
	const d = await desktop.newPage();
	try {
		await signIn(p, `I phone ${suffix}`);
		await signIn(d, `I desktop ${suffix}`);
		const dataset = unicodeDataset(suffix);
		await seedRecords(p, dataset.records);
		await p.reload();
		await waitForOutbox(p);
		await d.reload();
		await expect
			.poll(async () =>
				(await scenarioSnapshot(d)).session?.some((row) => row.id === dataset.ids.session),
			)
			.toBe(true);
		const appended = ' 中文追加';
		await patchScenarioRecord(d, 'project', dataset.ids.project, {
			name: `${dataset.values.project}${appended}`,
		});
		await patchScenarioRecord(d, 'place', dataset.ids.place, {
			name: `${dataset.values.place}${appended}`,
		});
		await patchScenarioRecord(d, 'work_item', dataset.ids.work_item, {
			name: `${dataset.values.work_item}${appended}`,
		});
		await patchScenarioRecord(d, 'session', dataset.ids.session, {
			note: `${dataset.values.note}${appended}`,
		});
		await d.reload();
		await waitForOutbox(d);
		await p.reload();
		const edited = {
			project: `${dataset.values.project}${appended}`,
			place: `${dataset.values.place}${appended}`,
			work_item: `${dataset.values.work_item}${appended}`,
			note: `${dataset.values.note}${appended}`,
		};
		const getStrings = async (page: typeof p) => {
			const state = await scenarioSnapshot(page);
			return {
				project: state.project?.find((row) => row.id === dataset.ids.project)?.name as string,
				place: state.place?.find((row) => row.id === dataset.ids.place)?.name as string,
				work_item: state.work_item?.find((row) => row.id === dataset.ids.work_item)?.name as string,
				note: state.session?.find((row) => row.id === dataset.ids.session)?.note as string,
			};
		};
		await expect.poll(async () => getStrings(p)).toEqual(edited);
		for (const page of [p, d]) {
			const actual = await getStrings(page);
			for (const field of Object.keys(edited) as (keyof typeof edited)[]) {
				expect(unicodeCodePoints(actual[field])).toEqual(unicodeCodePoints(edited[field]));
				expect(actual[field]).toContain('e\u0301');
				expect(actual[field].normalize('NFC')).not.toBe(actual[field]);
			}
		}
		await d.goto('/settings/backup');
		const downloading = d.waitForEvent('download');
		await d.getByRole('button', { name: 'Download backup', exact: true }).click();
		const download = await downloading;
		const parsed = JSON.parse((await readFile((await download.path())!)).toString()) as {
			records: Record<string, Array<Record<string, unknown>>>;
		};
		for (const entity of ['project', 'place', 'work_item', 'session'] as const) {
			const field = entity === 'session' ? 'note' : 'name';
			const exported = parsed.records[entity].find((row) => row.id === dataset.ids[entity])?.[
				field
			] as string;
			expect(unicodeCodePoints(exported)).toEqual(
				unicodeCodePoints(edited[entity === 'session' ? 'note' : entity]),
			);
		}
	} finally {
		await phone.close();
		await desktop.close();
		releaseCloud();
	}
});
