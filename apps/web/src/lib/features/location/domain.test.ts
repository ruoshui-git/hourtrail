import { describe, expect, it } from 'vitest';
import { expirePending, fixDecidesPlace, promptChoice } from './domain';

describe('location capture rules', () => {
	it('expires only pending captures older than two minutes', () => {
		const sessions = [
			{ id: 'old', place_state: 'pending', updated_at: 1 },
			{ id: 'recent', place_state: 'pending', updated_at: 60_001 },
			{ id: 'done', place_state: 'unresolved', updated_at: 1 },
		];
		expect(expirePending(sessions, 120_002).map((session) => session.id)).toEqual(['old']);
	});

	it('lets the start fix decide, while the end fix fills only an empty place', () => {
		expect(fixDecidesPlace('start', 'already-assigned')).toBe(true);
		expect(fixDecidesPlace('end', null)).toBe(true);
		expect(fixDecidesPlace('end', 'already-assigned')).toBe(false);
	});

	it('offers prompts only for suggested, ambiguous and unresolved states', () => {
		expect(
			['suggested', 'ambiguous', 'unresolved', 'set', 'dismissed', 'pending', 'none'].map(
				promptChoice,
			),
		).toEqual(['suggested', 'ambiguous', 'unresolved', null, null, null, null]);
	});
});
