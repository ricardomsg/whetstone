import { json, error } from '@sveltejs/kit';
import * as A2 from '$lib/server/exercises/a2';
import { getRun, missingFluencyKind, usedItems } from '$lib/server/benchmark';
import { chooseItem, countWhere } from '$lib/server/services';

export const POST = async ({ request }) => {
	const b = await request.json();
	if (b.action === 'start') {
		if (b.bench) {
			const { run } = getRun(b.bench);
			const pending = A2.pendingBenchmark(b.bench);
			if (pending) return json(pending);
			const done = countWhere('attempt', "benchmark_run_id = ? AND exercise = 'A2' AND finished_at IS NOT NULL", b.bench);
			if (done >= 2) error(409, 'Word Rush is finished for this benchmark');
			const kind = missingFluencyKind(b.bench);
			if (!kind) error(409, 'Word Rush is finished for this benchmark');
			const used = usedItems(b.bench);
			const it = chooseItem('A2', run.lang as any, 'FL', { parallelSet: run.parallelSet, exclude: used, where: (x) => x.prompt.kind === kind });
			if (!it) error(404, 'Benchmark set exhausted');
			return json(A2.start(run.lang as any, { benchmarkRunId: b.bench, itemId: it.id }));
		}
		return json(A2.start(b.lang ?? 'en', { kind: b.kind, exclude: b.exclude ?? [], dailySessionId: b.ds ?? null }));
	}
	if (b.action === 'skip') return json(A2.skip(b.attemptId));
	if (b.action === 'submit') return json(await A2.submit(b.attemptId, (b.words ?? []).map(String), Number(b.elapsedMs ?? 0)));
	error(400, 'unknown action');
};
