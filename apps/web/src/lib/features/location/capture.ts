import { db, repo } from '$lib/db/app';
import { chooseFix, GOOD_FIX_ACCURACY_M, matchPlace, readSetting, type Fix } from '@hourtrail/core';
import type { RecordOf } from '@hourtrail/core';
import { fixDecidesPlace } from './domain';
import { saveCapturedFix } from './raw-gps';

type CapturedFix = Fix & { captured_at: number };

const CAPTURE_TIMEOUT_MS = 20_000;
const coordinatesRemoved = new Set<string>();

function readPosition(position: GeolocationPosition): CapturedFix {
	return {
		lat: position.coords.latitude,
		lng: position.coords.longitude,
		accuracy_m: position.coords.accuracy,
		captured_at: position.timestamp,
	};
}

function selectedFix(fixes: CapturedFix[]): CapturedFix | undefined {
	const selected = chooseFix(fixes);
	return selected ? fixes.find((fix) => fix === selected) : undefined;
}

async function getFix(): Promise<CapturedFix | undefined> {
	if (!navigator.geolocation) return undefined;
	return await new Promise((resolve) => {
		const fixes: CapturedFix[] = [];
		let watch = 0;
		let timer: ReturnType<typeof setTimeout>;
		let done = false;
		const finish = (fix?: CapturedFix) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			navigator.geolocation.clearWatch(watch);
			resolve(fix);
		};
		try {
			watch = navigator.geolocation.watchPosition(
				(position) => {
					const fix = readPosition(position);
					fixes.push(fix);
					if (fix.accuracy_m <= GOOD_FIX_ACCURACY_M) finish(selectedFix(fixes));
				},
				() => finish(selectedFix(fixes)),
				{ enableHighAccuracy: true, maximumAge: 0, timeout: CAPTURE_TIMEOUT_MS },
			);
			timer = setTimeout(() => finish(selectedFix(fixes)), CAPTURE_TIMEOUT_MS);
		} catch {
			finish();
		}
	});
}

export async function captureFor(sessionId: string, kind: 'start' | 'end'): Promise<void> {
	try {
		if (kind === 'start') coordinatesRemoved.delete(sessionId);
		if (coordinatesRemoved.has(sessionId)) return;
		const enabled = await db.local.get('capture_location');
		if (enabled?.value !== true) {
			if (kind === 'start') await repo.update('session', sessionId, { place_state: 'none' });
			return;
		}
		const session = await db.session.get(sessionId);
		if (!session || session.source !== 'live') return;
		if (kind === 'start') await repo.update('session', sessionId, { place_state: 'pending' });
		const fix = await getFix();
		if (coordinatesRemoved.has(sessionId)) return;
		if (!fix) {
			await repo.update('session', sessionId, { place_state: 'unresolved', place_candidates: [] });
			return;
		}
		const rawSync = readSetting('sync_raw_gps', (await db.setting.get('sync_raw_gps'))?.value);
		await saveCapturedFix(db, repo, { session_id: sessionId, kind, ...fix }, rawSync);
		if (coordinatesRemoved.has(sessionId)) {
			await db.local_fix.delete(`${sessionId}:${kind}`);
			return;
		}
		const fresh = await db.session.get(sessionId);
		if (!fresh || !fixDecidesPlace(kind, fresh.place_id)) return;
		const places = (await db.place.toArray()) as RecordOf<'place'>[];
		const result = matchPlace(fix, places);
		const candidates =
			result.state === 'ambiguous'
				? result.candidates.map((candidate) => candidate.place_id)
				: result.state === 'set' || result.state === 'suggested'
					? [result.place_id]
					: [];
		await repo.update('session', sessionId, {
			place_id: result.state === 'set' ? result.place_id : fresh.place_id,
			place_state: result.state,
			place_candidates: candidates,
		});
	} catch {
		try {
			const session = await db.session.get(sessionId);
			if (session?.source === 'live' && session.place_state === 'pending') {
				await repo.update('session', sessionId, {
					place_state: 'unresolved',
					place_candidates: [],
				});
			}
		} catch {
			// Location capture must never change the outcome of a saved session.
		}
	}
}

export async function expireStaleCaptures(now = Date.now()): Promise<void> {
	const stale = await db.session
		.filter((session) => session.place_state === 'pending' && now - session.updated_at > 120_000)
		.toArray();
	await Promise.all(
		stale.map((session) => repo.update('session', session.id, { place_state: 'unresolved' })),
	);
}

export async function deleteRawCoordinates(): Promise<void> {
	const running = await repo.running();
	for (const session of running) coordinatesRemoved.add(session.id);
	await db.local_fix.clear();
}

export async function deleteSessionCoordinates(sessionId: string): Promise<void> {
	coordinatesRemoved.add(sessionId);
	const rows = await db.local_fix.toArray();
	await Promise.all(
		rows.filter((fix) => fix.session_id === sessionId).map((fix) => db.local_fix.delete(fix.id)),
	);
	await repo.update('session', sessionId, { place_candidates: [] });
}
