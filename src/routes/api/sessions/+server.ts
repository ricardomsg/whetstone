import { json } from '@sveltejs/kit';
import { sessions, sessionForCwd } from '$lib/server/exercises/resume';

export const GET = ({ url }) => {
	const cwd = url.searchParams.get('cwd');
	if (cwd) return json({ session: sessionForCwd(cwd) });
	return json({ sessions: sessions().slice(0, Number(url.searchParams.get('limit') ?? 30)) });
};
