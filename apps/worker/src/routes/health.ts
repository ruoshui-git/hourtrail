import { Hono } from 'hono';
import type { AppEnv } from '../env';

export const health = new Hono<AppEnv>();
health.get('/', (c) => c.json({ ok: true, time: Date.now() }));
