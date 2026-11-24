import { isRedirect, redirect, type Handle } from '@sveltejs/kit';
import { COOKIE, trustedTailscale, validSession, validToken } from '$lib/server/auth';
import { cookieWriteAllowed } from '$lib/core/origin';

// The only routes open without sign-in, matched by route id rather than path prefix, so an unknown path such as
// /login/x is not open and never renders a page with the app's links. Static files (the manifest, icons and the
// service worker) are served before this hook runs.
const OPEN_ROUTES = new Set(['/login', '/healthz']);

const json = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } });

const guard: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const { method, headers } = event.request;
	event.locals.viaTailscale = trustedTailscale(headers);
	if (event.route.id && OPEN_ROUTES.has(event.route.id)) return resolve(event);
	// The matched route catches encoded paths that the raw prefix misses.
	if (path.startsWith('/api/') || event.route.id?.startsWith('/api/')) {
		if (validToken(headers.get('authorization'))) return resolve(event);
		// The browser sends the session cookie, and Tailscale adds its header, on its own, so both get the same origin check.
		if (event.locals.viaTailscale || validSession(event.cookies.get(COOKIE))) {
			if (cookieWriteAllowed(method, headers.get('origin'), event.url.origin)) return resolve(event);
			return json(403, 'cross-origin request refused');
		}
		return json(401, 'unauthorised');
	}
	if (event.locals.viaTailscale) {
		// Page writes signed in by the header must come from the app's own origin too, whatever their content type.
		if (!cookieWriteAllowed(method, headers.get('origin'), event.url.origin)) return json(403, 'cross-origin request refused');
	} else if (!validSession(event.cookies.get(COOKIE))) {
		const next = encodeURIComponent(path + event.url.search);
		redirect(303, `/login?next=${next}`);
	}
	return resolve(event);
};

const secure = (response: Response) => {
	// No other site may frame the app, so clicks cannot be tricked into actions that pass the origin checks.
	// Responses depend on who is signed in, so no cache may reuse them unless a route chose otherwise.
	try {
		response.headers.set('content-security-policy', "frame-ancestors 'none'");
		response.headers.set('x-frame-options', 'DENY');
		if (!response.headers.has('cache-control')) response.headers.set('cache-control', 'private, no-store');
	} catch {
		// A response with immutable headers, such as a proxied fetch, keeps its own.
	}
	return response;
};

export const handle: Handle = async (input) => {
	const { event } = input;
	try {
		return secure(await guard(input));
	} catch (e) {
		// A plain page load sent to the login page gets the same headers. Client navigation and form
		// actions keep SvelteKit's own redirect protocol, so those redirects are left to it.
		const plain = !event.isDataRequest && (event.request.method === 'GET' || event.request.method === 'HEAD');
		if (isRedirect(e) && plain) return secure(new Response(null, { status: e.status, headers: { location: e.location } }));
		throw e;
	}
};

// A failed promise in one request must never take the server down.
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));

export const handleError = ({ error, event }) => {
	console.error(`${event.request.method} ${event.url.pathname}`, error);
	return { message: error instanceof Error ? error.message : 'Unexpected error' };
};
