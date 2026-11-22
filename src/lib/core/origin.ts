const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** A browser sends Origin on cross-origin writes, so a write made with the session cookie must carry the app's own. */
export function cookieWriteAllowed(method: string, origin: string | null, appOrigin: string): boolean {
	return SAFE.has(method.toUpperCase()) || origin === appOrigin;
}

/** Where to go after login: a same-origin path with its query and fragment, otherwise home. */
export function safeNext(next: string | null, origin: string): string {
	if (!next || !next.startsWith('/')) return '/';
	try {
		const u = new URL(next, origin);
		if (u.origin !== origin || u.pathname.startsWith('//')) return '/';
		return u.pathname + u.search + u.hash;
	} catch {
		return '/';
	}
}
