import type { Device } from './auth';

export interface Env {
	ASSETS: Fetcher;
	DB: D1Database;
	ACCOUNT_KEY_HASH?: string;
	VAPID_PUBLIC_KEY?: string;
	VAPID_PRIVATE_KEY?: string;
}

export type AppEnv = { Bindings: Env; Variables: { requestId: string; device: Device } };
