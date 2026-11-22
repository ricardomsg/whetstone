import { redirect } from '@sveltejs/kit';
import { sessions, isWorkSession } from '$lib/server/exercises/resume';

export const load = () => {
	const latest = sessions().find(isWorkSession);
	redirect(303, latest ? `/sessions/${encodeURIComponent(latest.id)}?note=1` : '/sessions#new-session');
};
