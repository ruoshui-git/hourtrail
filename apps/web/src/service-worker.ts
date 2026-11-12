/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';
import { fetchRoute } from '$lib/pwa/routing';

const CACHE = `hourtrail-${version}`;
const SHELL = '/';
const PRECACHE = [...new Set([...build, ...files, SHELL])];

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			await Promise.all(
				keys
					.filter((key) => key.startsWith('hourtrail-') && key !== CACHE)
					.map((key) => caches.delete(key)),
			);
			await self.clients.claim();
		}),
	);
});

self.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	const url = new URL(request.url);
	const route = fetchRoute(request.method, url.pathname, self.location.origin, url.origin);
	if (route === 'ignore') return;
	event.respondWith(
		caches.open(CACHE).then(async (cache) => {
			if (route === 'navigation') return (await cache.match(SHELL)) ?? fetch(request);
			return (await cache.match(request)) ?? fetch(request);
		}),
	);
});

// Task 4.5 adds push and notificationclick handlers here.
