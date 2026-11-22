import { fail, redirect } from '@sveltejs/kit';
import { checkPassphrase, createSession, COOKIE } from '$lib/server/auth';
import { env } from '$lib/server/env';
import { safeNext } from '$lib/core/origin';

export const load = () => ({ configured: !!env.passphraseHash });

export const actions = {
	default: async ({ request, cookies, url }) => {
		const f = await request.formData();
		if (!(await checkPassphrase(String(f.get('passphrase') ?? '')))) return fail(401, { error: 'Wrong passphrase.' });
		const s = createSession();
		cookies.set(COOKIE, s.id, { path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', expires: new Date(s.expiresAt) });
		redirect(303, safeNext(url.searchParams.get('next'), url.origin));
	}
};
