import { epochSchema } from '../schema';
import type { RecordOf, Entity } from '../schema';
import { checkedMutation } from './mutation';
import type { Mutation } from './mutation';
import { equal, managedFields, MutationError, recordValue } from './validation';

export type AnyRecord = RecordOf<Entity>;
/**
 * `validated: true` is the caller's assertion that the mutation came out of
 * `mutationSchema` (or `batchSchema`) and that a non-null `current` was read from
 * storage this module wrote. Those re-parses are then skipped; the id check on
 * `current` and every other rule still run. Without it, the input is checked in full.
 */
export type ApplyContext = { now: number; rev?: number; mode?: 'restore'; validated?: true };
export type ApplyResult = {
	next: AnyRecord | null;
	conflicts: RecordOf<'conflict'>[];
	changed: boolean;
};

export function clampAt(at: number, now: number): number {
	if (!epochSchema.safeParse(at).success || !epochSchema.safeParse(now).success)
		throw new MutationError('Edit time and applier time must be integer epoch milliseconds');
	return Math.min(at, now + 5 * 60_000);
}

/** Two seeded FNV-1a 64-bit lanes over UTF-16LE, packed as an RFC 9562 UUIDv8. */
export function conflictId(mutationId: string, field: string): string {
	const text = `${mutationId}|${field}`;
	const mask = (1n << 64n) - 1n;
	let left = 0xcbf29ce484222325n;
	let right = 0x84222325cbf29ce4n;
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		for (const byte of [code & 255, code >>> 8]) {
			left = ((left ^ BigInt(byte)) * 0x100000001b3n) & mask;
			right = ((right ^ BigInt(byte)) * 0x100000001b3n) & mask;
		}
	}
	let bits = (left << 64n) | right;
	bits = (bits & ~(15n << 76n)) | (8n << 76n);
	bits = (bits & ~(3n << 62n)) | (2n << 62n);
	const hex = bits.toString(16).padStart(32, '0');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function applyMutation(
	current: AnyRecord | null,
	m: Mutation,
	ctx: ApplyContext,
): ApplyResult {
	if (!ctx.validated) m = checkedMutation(m);
	const at = clampAt(m.at, ctx.now);
	if (ctx.rev !== undefined && (!Number.isSafeInteger(ctx.rev) || ctx.rev < 0))
		throw new MutationError('Revision must be a nonnegative integer');
	if (current !== null) {
		if (!ctx.validated) recordValue(m.entity, current);
		if (current.id !== m.record_id) throw new MutationError('Current record id mismatch');
	}
	const conflicts: RecordOf<'conflict'>[] = [];
	const unchanged = (): ApplyResult => ({ next: current, conflicts, changed: false });
	if (current === null && m.kind !== 'put') {
		if (m.kind === 'patch') throw new MutationError('Cannot patch a missing record');
		return unchanged();
	}
	const incoming = m.kind === 'put' ? recordValue(m.entity, m.value) : null;
	if (current !== null && incoming !== null && current.deleted_at !== incoming.deleted_at) {
		throw new MutationError('Put cannot change deleted_at on an existing record');
	}
	const candidate: Record<string, unknown> = { ...(current ?? incoming!) };
	const wins =
		current === null ||
		at > current.updated_at ||
		(at === current.updated_at && m.device_id >= current.updated_by);

	function conflict(field: string, kept: unknown, other: unknown, incomingWins: boolean) {
		const value = {
			id: conflictId(m.id, field),
			rev: ctx.rev ?? 0,
			created_at: ctx.now,
			updated_at: ctx.now,
			updated_by: incomingWins ? m.device_id : current!.updated_by,
			deleted_at: null,
			entity: m.entity,
			record_id: m.record_id,
			field,
			kept_value: kept,
			other_value: other,
			kept_device: incomingWins ? m.device_id : current!.updated_by,
			other_device: incomingWins ? current!.updated_by : m.device_id,
			at: ctx.now,
			resolved_at: null,
		};
		conflicts.push(recordValue('conflict', value) as RecordOf<'conflict'>);
	}

	if (incoming !== null && (current === null || ctx.mode === 'restore')) {
		Object.assign(candidate, incoming);
		if (current !== null) {
			candidate.rev = current.rev;
			candidate.updated_at = current.updated_at;
			candidate.updated_by = current.updated_by;
		}
	} else if (m.kind === 'delete') {
		if (current!.deleted_at !== null) return unchanged();
		candidate.deleted_at = at;
	} else if (m.kind === 'undelete') {
		if (current!.deleted_at === null) return unchanged();
		candidate.deleted_at = null;
	} else {
		const fields = incoming === null ? Object.keys(m.fields!) : Object.keys(incoming);
		for (const field of fields) {
			// Put carries immutable and write metadata; those are managed by the applier.
			if (incoming !== null && managedFields.has(field)) continue;
			const stored = candidate[field];
			const change = m.fields?.[field];
			const to = incoming === null ? change!.to : (incoming as Record<string, unknown>)[field];
			if (equal(stored, to)) continue;
			if (incoming === null && equal(stored, change!.from)) {
				candidate[field] = to;
			} else {
				conflict(field, wins ? to : stored, wins ? stored : to, wins);
				if (wins) candidate[field] = to;
			}
		}
		if (m.kind === 'patch' && current!.deleted_at !== null) {
			candidate.deleted_at = null;
			// A patch explicitly restores a deleted record regardless of edit-time ordering.
			conflict('deleted_at', null, current!.deleted_at, true);
		}
	}

	if (current !== null && equal(candidate, current)) return unchanged();
	candidate.updated_at = Math.max(current?.updated_at ?? at, at);
	candidate.updated_by = wins ? m.device_id : current!.updated_by;
	if (ctx.rev !== undefined) candidate.rev = ctx.rev;
	const next = recordValue(m.entity, candidate);
	if (current !== null && equal(next, current)) return unchanged();
	return { next, conflicts, changed: true };
}

/**
 * Rebase: apply pending local mutations over a pulled record in outbox (queue)
 * order, as given. Not by edit time: each patch's `from` is the previous patch's
 * `to`, and a device clock that stepped backwards must not reorder the user's edits.
 */
export function replay(
	pulled: AnyRecord | null,
	pending: Mutation[],
	ctx: ApplyContext,
): ApplyResult {
	let next = pulled;
	const conflicts: RecordOf<'conflict'>[] = [];
	const first = pending[0];
	for (const m of pending) {
		if (m.entity !== first!.entity || m.record_id !== first!.record_id)
			throw new MutationError('Replay requires mutations for one entity and record');
		const result = applyMutation(next, m, ctx);
		next = result.next;
		conflicts.push(...result.conflicts);
	}
	return { next: equal(next, pulled) ? pulled : next, conflicts, changed: !equal(next, pulled) };
}
