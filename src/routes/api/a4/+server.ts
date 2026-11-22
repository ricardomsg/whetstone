import { json, error } from '@sveltejs/kit';
import * as A4 from '$lib/server/exercises/a4';
import { getRun, usedItems } from '$lib/server/benchmark';
import { chooseItem, startAttempt, getItem } from '$lib/server/services';

export const POST = async ({ request }) => {
	const b = await request.json();
	if (b.action === 'start') {
		if (b.bench) {
			const { run } = getRun(b.bench);
			const it = chooseItem('A4', run.lang as any, 'PR', { parallelSet: run.parallelSet, exclude: usedItems(b.bench) });
			if (!it) error(404, 'Benchmark set exhausted');
			const a = startAttempt({ exercise: 'A4', lang: run.lang as any, itemId: it.id, benchmarkRunId: b.bench });
			return json({ attemptId: a.id, sentence: it.prompt.sentence, target: it.target, register: it.prompt.register, n: 5, lang: run.lang });
		}
		return json(A4.start(b.lang ?? 'en', { dailySessionId: b.ds ?? null }));
	}
	if (b.action === 'reference') {
		const it = getItem(String(b.itemId));
		if (!it || it.exercise !== 'A4') error(404, 'item not found');
		return json({ reference: await A4.referenceFor(it) });
	}
	if (b.action === 'submit') return json(await A4.submit(b.attemptId, { alternatives: b.alternatives ?? [], pick: String(b.pick ?? ''), justification: String(b.justification ?? '') }));
	error(400, 'unknown action');
};
