import { schemas } from '../schema';
import type { Entity, RecordOf } from '../schema';

export class MutationError extends Error {
	override name = 'MutationError';
}

/** JSON equality: object key order is immaterial; array order is significant. */
export function equal(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const left = a as Record<string, unknown>;
	const right = b as Record<string, unknown>;
	const keys = Object.keys(left);
	return (
		keys.length === Object.keys(right).length &&
		keys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]))
	);
}

export const immutableFields = new Set(['id', 'rev', 'created_at', 'deleted_at']);
export const managedFields = new Set([...immutableFields, 'updated_at', 'updated_by']);

export function checkField(entity: Entity, field: string, value: unknown): void {
	const shape = schemas[entity].shape;
	if (immutableFields.has(field) || !Object.hasOwn(shape, field)) {
		throw new MutationError(`Cannot patch ${entity}.${field}`);
	}
	const schema = shape[field as keyof typeof shape];
	if (!schema.safeParse(value).success) throw new MutationError(`Invalid ${entity}.${field}`);
}

export function recordValue(entity: Entity, value: unknown): RecordOf<Entity> {
	const parsed = schemas[entity].safeParse(value);
	if (!parsed.success) throw new MutationError(`Invalid ${entity} record: ${parsed.error.message}`);
	// Zod objects strip unknown keys by default. Reject rather than silently discard them.
	if (!equal(parsed.data, value)) throw new MutationError(`Unknown fields in ${entity} record`);
	return parsed.data;
}
