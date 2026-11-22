import { redirect } from '@sveltejs/kit';
import { planToday, todayPlan } from '$lib/server/planner';

export const load = () => {
	return todayPlan();
};

export const actions = {
	default: async ({ request }) => {
		const f = await request.formData();
		planToday(Number(f.get('minutes')) || 15, String(f.get('lang') || 'en'));
		redirect(303, '/today');
	}
};
