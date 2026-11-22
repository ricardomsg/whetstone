/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

// Caches the app shell only. Data always comes from the server (the app is useless offline anyway:
// scoring and capture live on the server).
const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `ws-${version}`;
const ASSETS = [...build, ...files];

sw.addEventListener('install', (e) => {
	e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => sw.skipWaiting()));
});
sw.addEventListener('activate', (e) => {
	e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => sw.clients.claim()));
});
sw.addEventListener('fetch', (e) => {
	if (e.request.method !== 'GET') return;
	const url = new URL(e.request.url);
	if (url.origin !== location.origin || !ASSETS.includes(url.pathname)) return;
	e.respondWith(caches.match(e.request).then((r) => r ?? fetch(e.request)));
});
