import { json, error } from '@sveltejs/kit';
import * as A1 from '$lib/server/exercises/a1';
import { getRun, usedItems } from '$lib/server/benchmark';
import { chooseItem } from '$lib/server/services';

export const POST = async ({ request }) => {
	const b = await request.json();
	switch (b.action) {
		case 'start': {
			if (b.bench) {
				const { run } = getRun(b.bench);
				const it = chooseItem('A1', run.lang as any, 'WR', { parallelSet: run.parallelSet, exclude: usedItems(b.bench) });
				if (!it) error(404, 'Benchmark set exhausted');
				return json(A1.start(run.lang as any, { benchmarkRunId: b.bench, itemId: it.id }));
			}
			const lang = b.lang === 'pt-PT' ? 'pt-PT' : 'en';
			if (b.def === 'en' || b.def === 'pt-PT') return json(A1.startCross(b.def, lang, { dailySessionId: b.ds ?? null, conceptId: b.concept ?? undefined }));
			return json(A1.start(lang, { dailySessionId: b.ds ?? null }));
		}
		case 'answer':
			return json(await A1.answer(b.attemptId, String(b.text ?? '')));
		case 'state':
			return json(A1.markState(b.attemptId, b.state));
		case 'hint':
			return json(A1.hint(b.attemptId, !!b.giveUp));
		case 'sentence':
			return json(await A1.sentence(b.attemptId, String(b.text ?? '')));
	}
	error(400, 'unknown action');
};
