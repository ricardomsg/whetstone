/**
 * Tailscale Serve sets Tailscale-User-Login on each request it proxies from a signed-in tailnet user.
 * The header is trusted only when it is exactly the configured account, so a tagged device, a request
 * that bypasses Serve without the header, or an appended or forged second value never matches.
 */
export function tailscaleLoginMatches(header: string | null, expected: string): boolean {
	const want = expected.trim();
	return !!want && header === want;
}

/**
 * Serve attaches the identity to every request any browser on the device makes, including ones another
 * site triggers. So it is accepted only on requests the browser marks as coming from the app itself
 * (same-origin) or as started by the user (none: a typed address, a bookmark, or a link opened from
 * another app). Requests without fetch metadata, and cross-site or same-site ones, are not signed in by it.
 */
export function tailscaleRequestAllowed(secFetchSite: string | null): boolean {
	return secFetchSite === 'same-origin' || secFetchSite === 'none';
}
