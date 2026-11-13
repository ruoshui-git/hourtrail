import {
	devicesResponseSchema,
	enrollRequestSchema,
	linkFinishRequestSchema,
	linkStartResponseSchema,
	sessionResponseSchema,
} from '@hourtrail/core';
import type { DeviceInfo, SessionResponse } from '@hourtrail/core';
import { ApiError, apiFetch, OfflineError } from '$lib/api/client';
import { db, repo } from '$lib/db/app';

const AUTH_DEVICE_KEY = 'auth_device' as const;
const emptyResponseSchema = {
	parse(value: unknown): undefined {
		if (value !== undefined) throw new TypeError('Expected an empty response.');
		return undefined;
	},
};

class AuthState {
	private revision = 0;
	status = $state<'unknown' | 'signed-out' | 'signed-in'>('unknown');
	device = $state<DeviceInfo | null>(null);
	signedOutBy401 = $state(false);
	devices = $state<DeviceInfo[]>([]);

	async hydrate() {
		const row = await db.local.get(AUTH_DEVICE_KEY);
		if (row && 'value' in row) {
			this.device = row.value as DeviceInfo;
			this.status = 'signed-in';
		} else this.status = 'signed-out';
	}

	private async cache(device: DeviceInfo) {
		this.revision += 1;
		this.device = device;
		this.status = 'signed-in';
		this.signedOutBy401 = false;
		await db.local.put({ key: AUTH_DEVICE_KEY, value: device });
	}

	async refresh() {
		if (this.status === 'unknown') await this.hydrate();
		const hadCachedSession = this.status === 'signed-in';
		const revision = this.revision;
		try {
			const result = await apiFetch('/api/auth/session', { schema: sessionResponseSchema });
			await this.cache(result.device);
		} catch (error) {
			if (error instanceof OfflineError) return;
			if (error instanceof ApiError && error.status === 401) {
				if (revision !== this.revision) return;
				if (hadCachedSession) this.handleUnauthorized();
				else this.status = 'signed-out';
				return;
			}
			throw error;
		}
	}

	async enroll(key: string, name: string) {
		const payload = enrollRequestSchema.parse({
			account_key: key,
			device_id: await repo.deviceId(),
			device_name: name,
		});
		const result = await this.callSession('/api/auth/enroll', payload);
		await this.cache(result.device);
	}

	async link(code: string, name: string) {
		const payload = linkFinishRequestSchema.parse({
			code,
			device_id: await repo.deviceId(),
			device_name: name,
		});
		const result = await this.callSession('/api/auth/link/finish', payload);
		await this.cache(result.device);
	}

	private async callSession(path: string, body: unknown): Promise<SessionResponse> {
		return apiFetch(path, { method: 'POST', body, schema: sessionResponseSchema });
	}

	async startLink() {
		try {
			return await apiFetch('/api/auth/link/start', {
				method: 'POST',
				body: {},
				schema: linkStartResponseSchema,
			});
		} catch (error) {
			if (error instanceof ApiError && error.status === 401) this.handleUnauthorized();
			throw error;
		}
	}

	async loadDevices() {
		try {
			const result = await apiFetch('/api/auth/devices', { schema: devicesResponseSchema });
			this.devices = result.devices;
			const current = result.devices.find((item) => item.current);
			if (current) await this.cache(current);
			return result.devices;
		} catch (error) {
			if (error instanceof ApiError && error.status === 401) this.handleUnauthorized();
			throw error;
		}
	}

	async revoke(id: string) {
		try {
			await apiFetch(`/api/auth/devices/${encodeURIComponent(id)}`, {
				method: 'DELETE',
				schema: emptyResponseSchema,
			});
			await this.loadDevices();
		} catch (error) {
			if (error instanceof ApiError && error.status === 401) this.handleUnauthorized();
			throw error;
		}
	}

	async signOut() {
		try {
			await apiFetch('/api/auth/signout', {
				method: 'POST',
				body: {},
				schema: emptyResponseSchema,
			});
		} catch (error) {
			if (error instanceof ApiError && error.status === 401) this.handleUnauthorized();
			throw error;
		}
		this.device = null;
		this.devices = [];
		this.status = 'signed-out';
		this.signedOutBy401 = false;
		this.revision += 1;
		await db.local.delete(AUTH_DEVICE_KEY);
	}

	handleUnauthorized() {
		this.revision += 1;
		this.status = 'signed-out';
		this.signedOutBy401 = true;
		this.devices = [];
	}
}

export const auth = new AuthState();
