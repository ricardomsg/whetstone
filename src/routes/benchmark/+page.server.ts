import { redirect } from '@sveltejs/kit';
import { runs, startRun, nextSet } from '$lib/server/benchmark';

export const load = () => ({ runs: runs(), sets: { en: nextSet('en'), pt: nextSet('pt-PT') } });
export const actions = {
	default: async ({ request }) => {
		const f = await request.formData();
		redirect(303, `/benchmark/${startRun(String(f.get('lang') ?? 'en'))}`);
	}
};
