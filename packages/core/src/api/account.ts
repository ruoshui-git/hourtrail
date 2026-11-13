import { z } from 'zod';

export const eraseAccountRequestSchema = z.strictObject({ account_key: z.string() });

export type EraseAccountRequest = z.infer<typeof eraseAccountRequestSchema>;
