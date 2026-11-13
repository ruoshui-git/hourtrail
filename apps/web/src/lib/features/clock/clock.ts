export const CLOCK_SKEW_LIMIT_MS = 2 * 60_000;

let offsetMs = 0;
let previous: { wall: number; monotonic: number } | undefined;
let jumpSuspect = false;

export function setClockOffset(value: unknown): void {
	offsetMs = typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function clockOffset(): number {
	return offsetMs;
}

export function clockOffsetMinutes(
	offset = offsetMs,
): { minutes: number; direction: 'ahead' | 'behind' } | null {
	if (Math.abs(offset) <= CLOCK_SKEW_LIMIT_MS) return null;
	return {
		minutes: Math.round(Math.abs(offset) / 60_000),
		direction: offset < 0 ? 'ahead' : 'behind',
	};
}

export function observeClock(wall: number, monotonic: number, running: boolean): boolean {
	if (previous && running) {
		const wallDelta = wall - previous.wall;
		const monotonicDelta = monotonic - previous.monotonic;
		if (Math.abs(wallDelta - monotonicDelta) > CLOCK_SKEW_LIMIT_MS) jumpSuspect = true;
	}
	previous = { wall, monotonic };
	if (!running) jumpSuspect = false;
	return jumpSuspect;
}

export function clockSuspect(): boolean {
	return clockOffsetMinutes() !== null || jumpSuspect;
}
