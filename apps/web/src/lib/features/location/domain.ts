export function expirePending<T extends { place_state: string; updated_at: number }>(
	sessions: T[],
	now: number,
) {
	return sessions
		.filter((session) => session.place_state === 'pending' && now - session.updated_at > 120_000)
		.map((session) => session);
}

export function promptChoice(state: string): 'suggested' | 'ambiguous' | 'unresolved' | null {
	return state === 'suggested' || state === 'ambiguous' || state === 'unresolved' ? state : null;
}

export function fixDecidesPlace(kind: 'start' | 'end', placeId: string | null) {
	return kind === 'start' || placeId === null;
}
