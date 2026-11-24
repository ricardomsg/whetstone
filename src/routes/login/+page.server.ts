import { fail, redirect } from '@sveltejs/kit';
import { checkPassphrase, createSession, tailscaleIdentified, COOKIE } from '$lib/server/auth';
import { env } from '$lib/server/env';
import { safeNext } from '$lib/core/origin';

export const load = ({ locals, url, request }) => {
	const next = safeNext(url.searchParams.get('next'), url.origin);
	if (locals.viaTailscale) redirect(303, next);
	const identified = tailscaleIdentified(request.headers);
	// A browser that sends no fetch metadata can never be signed in by Tailscale, so Continue would loop.
	const noMetadata = identified && !request.headers.get('sec-fetch-site');
	return {
		configured: !!env.passphraseHash,
		tailscale: !!env.tailscaleLogin,
		noMetadata,
		// Tailscale vouched for the account, but the browser did not say the request came from the app or the user,
		// as after a link on another site. Clicking Continue makes a fresh same-origin navigation.
		continueTo: identified && !noMetadata ? next : null
	};
};

export const actions = {
	default: async ({ request, cookies, url }) => {
		const f = await request.formData();
		if (!(await checkPassphrase(String(f.get('passphrase') ?? '')))) return fail(401, { error: 'Wrong passphrase.' });
		const s = createSession();
		cookies.set(COOKIE, s.id, { path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', expires: new Date(s.expiresAt) });
		redirect(303, safeNext(url.searchParams.get('next'), url.origin));
	}
};
