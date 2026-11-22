import { redirect, type Handle } from '@sveltejs/kit';
import { COOKIE, validSession, validToken } from '$lib/server/auth';
import { cookieWriteAllowed } from '$lib/core/origin';

const OPEN = ['/login', '/manifest.webmanifest', '/icons/', '/favicon', '/service-worker.js', '/healthz'];

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	if (OPEN.some((p) => path.startsWith(p))) return resolve(event);
	if (path.startsWith('/api/')) {
		if (validToken(event.request.headers.get('authorization'))) return resolve(event);
		if (validSession(event.cookies.get(COOKIE))) {
			if (cookieWriteAllowed(event.request.method, event.request.headers.get('origin'), event.url.origin)) return resolve(event);
			return new Response(JSON.stringify({ error: 'cross-origin request refused' }), { status: 403, headers: { 'content-type': 'application/json' } });
		}
		return new Response(JSON.stringify({ error: 'unauthorised' }), { status: 401, headers: { 'content-type': 'application/json' } });
	}
	if (!validSession(event.cookies.get(COOKIE))) {
		const next = encodeURIComponent(path + event.url.search);
		redirect(303, `/login?next=${next}`);
	}
	return resolve(event);
};

// A failed promise in one request must never take the server down.
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));

export const handleError = ({ error, event }) => {
	console.error(`${event.request.method} ${event.url.pathname}`, error);
	return { message: error instanceof Error ? error.message : 'Unexpected error' };
};
