import { redirect } from '@sveltejs/kit';
import { getSettings, saveSettings, LLM_FEATURES, type Settings } from '$lib/server/settings';
import { env } from '$lib/server/env';
import { llmSpend } from '$lib/server/analytics';
import { COOKIE, deleteSession, validSession } from '$lib/server/auth';
import { lexiconSize, countWhere } from '$lib/server/services';

export const load = ({ locals, cookies }) => ({
	viaTailscale: locals.viaTailscale,
	hasSession: validSession(cookies.get(COOKIE)),
	s: getSettings(),
	features: LLM_FEATURES,
	provider: { name: env.provider, fast: env.modelFast, judge: env.modelJudge },
	spend: llmSpend(30),
	tokenSet: !!env.apiToken,
	transcripts: env.claudeProjectsDir,
	stats: { lexicon: lexiconSize(), items: countWhere('item'), attempts: countWhere('attempt') }
});

export const actions = {
	save: async ({ request }) => {
		const f = await request.formData();
		const n = (k: string, d: number) => (f.get(k) != null && f.get(k) !== '' ? Number(f.get(k)) : d);
		const s = getSettings();
		const llm = Object.fromEntries(Object.keys(LLM_FEATURES).map((k) => [k, f.get(`llm-${k}`) === 'on']));
		saveSettings({
			defaultLang: (f.get('defaultLang') as Settings['defaultLang']) ?? s.defaultLang,
			sessionMinutes: n('sessionMinutes', s.sessionMinutes) as Settings['sessionMinutes'],
			effortWindowSec: n('effortWindowSec', s.effortWindowSec),
			reviewCap: n('reviewCap', s.reviewCap),
			hintPenalty: n('hintPenalty', s.hintPenalty),
			graduateUses: n('graduateUses', s.graduateUses),
			graduateDays: n('graduateDays', s.graduateDays),
			resumePrompting: f.get('resumePrompting') === 'on',
			transcriptTailTurns: n('transcriptTailTurns', s.transcriptTailTurns),
			llm
		});
		return { saved: true };
	},
	logout: ({ cookies }) => {
		const id = cookies.get(COOKIE);
		if (id) deleteSession(id);
		cookies.delete(COOKIE, { path: '/' });
		redirect(303, '/login');
	}
};
