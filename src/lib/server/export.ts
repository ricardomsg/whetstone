import { strToU8, zipSync } from 'fflate';
import { sqlite } from './db';

export const EXPORT_TABLES = ['user_settings', 'daily_checkin', 'rubric', 'item', 'attempt', 'judge_eval', 'score_override', 'skill_rating', 'skill_rating_history', 'card', 'review_log', 'vocab_entry', 'tot_log', 'work_session', 'resume_note', 'resume_attempt', 'thread', 'thread_keypoint', 'thread_practice', 'daily_session', 'benchmark_run', 'llm_usage'];

function csvCell(value: unknown): string {
	let text = value == null ? '' : String(value);
	// Keep user-entered text from being interpreted as a spreadsheet formula.
	if (typeof value === 'string' && (/^\s*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text))) text = `'${text}`;
	return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
	return '\uFEFF' + [columns.map(csvCell).join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';
}

/** All tables use one read snapshot; empty tables still include their column names. */
export function exportCsv(): Uint8Array {
	return sqlite.transaction(() => {
		const files = Object.fromEntries(EXPORT_TABLES.map((table) => {
			const query = sqlite.prepare(`SELECT * FROM ${table}`);
			const columns = query.columns().map((c) => c.name);
			return [`${table}.csv`, strToU8(toCsv(columns, query.all() as Record<string, unknown>[]))];
		}));
		return zipSync(files);
	})();
}
