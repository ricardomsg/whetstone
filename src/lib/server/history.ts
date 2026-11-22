import { sqlite } from './db';
import { GRADE_NAMES } from '$lib/core/srs';

// Readable summaries of attempts for the History page and the detail view.

export interface HistoryRow {
	id: string;
	exercise: string;
	lang: string;
	at: number;
	finished: boolean;
	title: string;
	subtitle: string;
	score: number | null;
	dim: string | null;
	state: string | null;
	bench: boolean;
	overridden: boolean;
}

const STATE: Record<string, string> = { correct: 'Correct', synonym: 'Accepted synonym', near_miss: 'Near miss', revealed: 'Revealed' };

export function summarise(r: any): HistoryRow {
	const input = r.input ? JSON.parse(r.input) : {};
	const metrics = r.metrics ? JSON.parse(r.metrics) : {};
	const scores = r.scores ? JSON.parse(r.scores) : {};
	const prompt = r.item_prompt ? JSON.parse(r.item_prompt) : {};
	const [dim, score] = (Object.entries(scores)[0] as [string, number] | undefined) ?? [null, null];
	let title = r.exercise;
	let subtitle = '';
	switch (r.exercise) {
		case 'A1':
			title = r.finished_at ? r.target : 'Unfinished';
			subtitle = r.finished_at
				? [STATE[r.state] ?? r.state, metrics.hints ? `${metrics.hints} hint${metrics.hints > 1 ? 's' : ''}` : 'no hints', metrics.tot ? 'tip of tongue' : ''].filter(Boolean).join(' · ')
				: prompt.definition ?? '';
			break;
		case 'A8':
			title = r.finished_at ? `${prompt.cue} → ${r.target}` : 'Unfinished';
			subtitle = r.finished_at
				? [STATE[r.state] ?? r.state, metrics.hints ? `${metrics.hints} hint${metrics.hints > 1 ? 's' : ''}` : 'no hints', metrics.trapHit ? 'false friend' : '', metrics.latencyMs ? `${(metrics.latencyMs / 1000).toFixed(1)} s` : ''].filter(Boolean).join(' · ')
				: String(prompt.cue ?? '');
			break;
		case 'A2':
			title = prompt.kind === 'letter' ? `Words starting with ${String(prompt.prompt).toUpperCase()}` : String(prompt.prompt ?? '');
			subtitle = r.finished_at ? `${metrics.valid} ${metrics.validated === false ? 'words, not checked' : 'valid words'}${metrics.repetitions ? ` · ${metrics.repetitions} repeated` : ''}${metrics.intrusions ? ` · ${metrics.intrusions} off-topic` : ''}` : 'Not started';
			break;
		case 'A4':
			title = input.pick ? `“${r.target}” → ${input.pick}` : `“${r.target}”`;
			subtitle = String(prompt.sentence ?? '');
			break;
		case 'B2':
			title = r.finished_at ? (r.target ?? 'Review') : 'Unfinished review';
			subtitle = metrics.finalGrade ? `Graded ${GRADE_NAMES[metrics.finalGrade]}${metrics.overridden ? ' (changed by you)' : ''}` : 'Unfinished';
			break;
		case 'B3':
			title = r.vocab_word ?? r.target ?? 'Use it';
			subtitle = r.finished_at ? `${(input.sentences ?? []).length} sentence${(input.sentences ?? []).length === 1 ? '' : 's'} · ${metrics.correctUse ? 'counted as a correct use' : 'not counted yet'}` : 'Unfinished';
			break;
		case 'D1':
			title = r.session_title ?? 'Resume note';
			subtitle = 'Resume note';
			break;
		case 'C1':
			title = `${input.person} — ${input.topic}`;
			subtitle = 'Conversation recap';
			break;
		case 'C2':
		case 'C3':
			title = input.cue ?? 'Conversation recall';
			subtitle = r.finished_at ? `${r.exercise === 'C2' ? 'Delayed recall' : 'Re-entry'} · ${Math.round((metrics.elapsedMs ?? 0) / 1000)} s` : 'Unfinished recall';
			break;
		case 'D2':
			title = r.session_title ?? 'Resume drill';
			subtitle = `Resume drill${metrics.resumeMs ? ` · back in flow after ${Math.round(metrics.resumeMs / 1000)} s` : ''}`;
			break;
	}
	return {
		id: r.id,
		exercise: r.exercise,
		lang: r.lang,
		at: r.started_at,
		finished: !!r.finished_at,
		title,
		subtitle,
		score: typeof score === 'number' ? score : null,
		dim,
		state: r.state,
		bench: !!r.benchmark_run_id,
		overridden: !!r.overridden
	};
}

const SELECT = `SELECT a.*, i.target, i.prompt item_prompt, v.word vocab_word, ws.title session_title
	FROM attempt a
	LEFT JOIN item i ON i.id = a.item_id
	LEFT JOIN vocab_entry v ON v.id = json_extract(a.input, '$.vocabId')
	LEFT JOIN work_session ws ON ws.id = COALESCE(json_extract(a.metrics, '$.sessionId'), (SELECT session_id FROM resume_attempt ra WHERE ra.attempt_id = a.id))`;

export function listHistory(o: { exercise?: string; lang?: string; before?: number; unfinished?: boolean; limit?: number }) {
	const where: string[] = [];
	const args: unknown[] = [];
	if (o.exercise) (where.push('a.exercise = ?'), args.push(o.exercise));
	if (o.lang) (where.push('a.lang = ?'), args.push(o.lang));
	if (o.before) (where.push('a.started_at < ?'), args.push(o.before));
	if (!o.unfinished) where.push('a.finished_at IS NOT NULL');
	const limit = o.limit ?? 60;
	const rows = sqlite.prepare(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.started_at DESC LIMIT ?`).all(...(args as any[]), limit + 1) as any[];
	return { rows: rows.slice(0, limit).map(summarise), more: rows.length > limit };
}

export function historyItem(id: string) {
	const r = sqlite.prepare(`${SELECT} WHERE a.id = ?`).get(id) as any;
	return r ? { row: summarise(r), raw: r } : null;
}

export function totals() {
	return sqlite
		.prepare(`SELECT exercise, count(*) n, avg(COALESCE(json_extract(scores,'$.WR'), json_extract(scores,'$.FL'), json_extract(scores,'$.PR'), json_extract(scores,'$.VOC'), json_extract(scores,'$.TRA'), json_extract(scores,'$.TRP'))) avg FROM attempt WHERE finished_at IS NOT NULL AND benchmark_run_id IS NULL GROUP BY exercise`)
		.all() as { exercise: string; n: number; avg: number | null }[];
}
