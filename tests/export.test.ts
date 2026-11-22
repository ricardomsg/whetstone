import { expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { EXPORT_TABLES, exportCsv, toCsv } from '../src/lib/server/export';
import { db, schema } from '../src/lib/server/db';

it('preserves accents, commas, quotes, multiline text, nulls and numbers', () => {
	expect(toCsv(['text', 'n', 'empty'], [{ text: 'ação, "sim"\nnext', n: -2, empty: null }]))
		.toBe('\uFEFF"text","n","empty"\r\n"ação, ""sim""\nnext","-2",""\r\n');
});

it('exports spreadsheet formula-like text as literal text', () => {
	for (const text of ['=1+2', '+SUM(A1)', '-1+2', '@SUM(A1)', '\t=1', '  =1']) {
		expect(toCsv(['text'], [{ text }])).toContain(`"'${text}"`);
	}
});

it('creates a readable archive of every export table, including headers for empty tables', () => {
	db.insert(schema.resumeNote).values({ id: 'note', sessionId: 'manual', stoppedAt: 'ação, "sim"\nnext', nextAction: 'Continue' }).run();
	const files = unzipSync(exportCsv());
	expect(Object.keys(files).sort()).toEqual(EXPORT_TABLES.map((t) => `${t}.csv`).sort());
	expect(strFromU8(files['resume_note.csv'])).toContain('"ação, ""sim""\nnext"');
	expect(strFromU8(files['review_log.csv'])).toContain('"id",');
	expect(strFromU8(files['review_log.csv']).split('\r\n')).toHaveLength(2);
	expect(files['auth_session.csv']).toBeUndefined();
});
