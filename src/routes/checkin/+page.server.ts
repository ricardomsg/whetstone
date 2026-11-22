import { redirect } from '@sveltejs/kit';
import { todayCheckin, saveCheckin } from '$lib/server/planner';

export const load = () => ({ c: todayCheckin() });

const num = (v: FormDataEntryValue | null) => (v == null || v === '' ? undefined : Number(v));
export const actions = {
	default: async ({ request }) => {
		const f = await request.formData();
		saveCheckin({
			sleepHours: num(f.get('sleepHours')),
			sleepQuality: num(f.get('sleepQuality')),
			energy: num(f.get('energy')),
			stress: num(f.get('stress')),
			exercise: (f.get('exercise') as string) || undefined,
			mainLanguage: (f.get('mainLanguage') as string) || undefined
		});
		redirect(303, '/');
	}
};
