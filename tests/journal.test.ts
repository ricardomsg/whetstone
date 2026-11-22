import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, schema } from '../src/lib/server/db';
import { env } from '../src/lib/server/env';
import { complete } from '../src/lib/server/llm/provider';
import { entryPathFor, journalDay, journalMetrics, mtld, sentences, voiceTranscript, baselineOf, guessLang } from '../src/lib/core/journal';
import { renderMarkdown } from '../src/lib/core/markdown';
import { kindOf, listEntries, readEntry, saveEntry, todayId, listReports, readReport } from '../src/lib/server/journal/store';
import { applyScope, generateReport, wording } from '../src/lib/server/journal/coach';

vi.mock('../src/lib/server/llm/provider', async (original) => ({ ...(await original<object>()), complete: vi.fn() }));
const model = vi.mocked(complete);
const reply = (data: unknown) => ({ text: JSON.stringify(data), provider: 'test', model: 'test', tokensIn: 10, tokensOut: 10, costUsd: 0, promptHash: 'test' });

const dir = mkdtempSync(join(tmpdir(), 'ws-journal-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function vault() {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(join(dir, 'Journal/2026/26.10'), { recursive: true });
	mkdirSync(join(dir, 'Journal/Voice Journals'), { recursive: true });
	mkdirSync(join(dir, 'Journal/Finance'), { recursive: true });
	writeFileSync(join(dir, 'Journal/2026/26.10/2026-10-22.md'), 'SECRET-A. I just walked. I just sat. I just slept and I didnt mind.\n');
	writeFileSync(join(dir, 'Journal/2026/26.10/2026-10-23.md'), 'SECRET-B. It was a long day and the light was low.\n');
	writeFileSync(join(dir, 'Journal/Voice Journals/2026-10-23.md'), '# x\n\n## Summary\n*AI words*\n\n## Raw Transcript\n[Voice note]\n\n[00:00:00.000 --> 00:00:06.000] You know, I was, you know, driving.\n');
	writeFileSync(join(dir, 'Journal/Finance/2026-10-01.md'), 'not an entry');
}

describe('journal metrics', () => {
	it('splits sentences and skips headings and fragments', () => {
		expect(sentences('# Title\nI walked to the shop. Then home!\nOk.')).toEqual(['I walked to the shop.']);
	});
	it('counts fillers as phrases, repeated words and missing apostrophes', () => {
		const m = journalMetrics('You know I just think, you know, it is just fine. I didnt go. I didnt stay. Walking walking walking.');
		expect(m.fillersPer1000.find((f) => f.phrase === 'you know')?.count).toBe(2);
		expect(m.fillersPer1000.find((f) => f.phrase === 'just')?.count).toBe(2);
		expect(m.noApostrophe).toEqual([{ wrong: 'didnt', right: "didn't", count: 2 }]);
		expect(m.repeated[0]).toEqual({ word: 'walking', count: 3 });
		expect(m.openers[0].word).toBe('i');
	});
	it('flags words used far more than in the whole journal', () => {
		const base = baselineOf([Array.from({ length: 2000 }, (_, i) => `word${i % 400}`).join(' ') + ' silence']);
		const m = journalMetrics('Silence again. Silence everywhere and silence at night, then sleep.', { baseline: base });
		expect(m.moreThanUsual[0].word).toBe('silence');
	});
	it('measures MTLD only on long enough text, and higher for varied text', () => {
		expect(mtld('a b c'.split(' '))).toBeNull();
		const flat = Array.from({ length: 200 }, (_, i) => ['the', 'cat', 'sat'][i % 3]);
		const varied = Array.from({ length: 200 }, (_, i) => `w${i}`);
		expect(mtld(varied)!).toBeGreaterThan(mtld(flat)!);
	});
	it('reads only the raw transcript of a voice journal, without timestamps', () => {
		const t = voiceTranscript('## Summary\nAI\n## Raw Transcript\n[Voice note]\n[00:00:00.000 --> 00:00:06.000] Hello there.\n## Later\nmore');
		expect(t).toBe('Hello there.');
	});
	it('counts writing after midnight as the night before', () => {
		expect(journalDay(Date.parse('2026-10-24T01:30:00+01:00'), 'Europe/Lisbon')).toBe('2026-10-23');
		expect(journalDay(Date.parse('2026-10-24T22:30:00+01:00'), 'Europe/Lisbon')).toBe('2026-10-24');
		expect(entryPathFor('2026-10-24')).toBe('Journal/2026/26.10/2026-10-24.md');
	});
	it('guesses Portuguese', () => {
		expect(guessLang('Hoje fui ao mercado e não comprei nada porque estava tudo caro.')).toBe('pt-PT');
		expect(guessLang('Today I went to the market and bought nothing.')).toBe('en');
	});
});

describe('markdown', () => {
	it('escapes HTML and renders wiki links through the resolver', () => {
		const h = renderMarkdown('---\na: 1\n---\n# T\n<script>x</script> **b** [[Personal/Journal/x|x]]\n- one\n> q', (t) => (t.startsWith('Personal/') ? '/journal?e=1' : null));
		expect(h).not.toContain('<script>');
		expect(h).toContain('&lt;script&gt;');
		expect(h).toContain('<h2>T</h2>');
		expect(h).toContain('<a href="/journal?e=1">x</a>');
		expect(h).toContain('<li>one</li>');
		expect(h).toContain('<blockquote>q</blockquote>');
		expect(h).not.toContain('a: 1');
	});
	it('terminates on a line that starts with a bar', () => {
		expect(renderMarkdown('| not a table')).toBe('<p>| not a table</p>');
	});
});

describe('journal store', () => {
	beforeEach(() => {
		vault();
		env.journalDir = dir;
		model.mockReset();
	});

	it('lists written and voice entries, newest first, and nothing else', () => {
		const ids = listEntries().map((e) => e.id);
		expect(ids).toEqual(['Journal/2026/26.10/2026-10-23.md', 'Journal/Voice Journals/2026-10-23.md', 'Journal/2026/26.10/2026-10-22.md']);
	});

	it('refuses paths outside the journal and edits to voice journals', () => {
		expect(kindOf('Journal/2026/26.10/../../../x.md')).toBeNull();
		expect(kindOf('Journal/Finance/2026-10-01.md')).toBeNull();
		expect(() => readEntry('../etc/passwd')).toThrow();
		expect(() => saveEntry('Journal/Voice Journals/2026-10-23.md', 'x', null)).toThrow();
		expect(() => saveEntry('Journal/2026/26.10/notes.md', 'x', null)).toThrow();
		expect(() => saveEntry('Journal/2026/26.10/2026-11-01.md', 'x', null)).toThrow();
		expect(saveEntry('Journal/2026/26.10/2026-10-30 - Reflections.md', 'x', null).ok).toBe(true);
	});

	it('creates tonight’s entry on first save, in the vault’s folder layout', () => {
		const id = todayId(Date.parse('2026-11-02T23:00:00Z'));
		expect(id).toBe('Journal/2026/26.11/2026-11-02.md');
		expect(readEntry(id).hash).toBeNull();
		const r = saveEntry(id, 'First line.', null);
		expect(r.ok).toBe(true);
		expect(readFileSync(join(dir, id), 'utf8')).toBe('First line.');
	});

	it('refuses a symlink that points out of the journal', () => {
		const outside = mkdtempSync(join(tmpdir(), 'ws-outside-'));
		writeFileSync(join(outside, 'x.md'), 'outside');
		symlinkSync(join(outside, 'x.md'), join(dir, 'Journal/2026/26.10/2026-10-25.md'));
		symlinkSync(outside, join(dir, 'Journal/2026/26.12'));
		expect(() => readEntry('Journal/2026/26.10/2026-10-25.md')).toThrow();
		expect(() => saveEntry('Journal/2026/26.10/2026-10-25.md', 'x', null)).toThrow();
		expect(() => saveEntry('Journal/2026/26.12/2026-12-01.md', 'x', null)).toThrow();
		expect(readFileSync(join(outside, 'x.md'), 'utf8')).toBe('outside');
		expect(existsSync(join(outside, '2026-12-01.md'))).toBe(false);
		// A dangling link is refused too, for entries and for the wording log.
		symlinkSync(join(outside, 'gone.md'), join(dir, 'Journal/2026/26.10/2026-10-26.md'));
		expect(() => saveEntry('Journal/2026/26.10/2026-10-26.md', 'x', null)).toThrow();
		expect(existsSync(join(outside, 'gone.md'))).toBe(false);
		expect(listEntries().some((e) => e.id.includes('2026-10-25') || e.id.includes('26.12'))).toBe(false);
		rmSync(outside, { recursive: true, force: true });
	});

	it('replaces a file in one step and leaves no temporary file behind', () => {
		const id = 'Journal/2026/26.10/2026-10-22.md';
		expect(saveEntry(id, 'New text.', readEntry(id).hash).ok).toBe(true);
		expect(readFileSync(join(dir, id), 'utf8')).toBe('New text.');
		expect(readdirSync(join(dir, 'Journal/2026/26.10')).filter((f) => f.startsWith('.'))).toEqual([]);
	});

	it('never overwrites a change made elsewhere', () => {
		const id = 'Journal/2026/26.10/2026-10-23.md';
		const e = readEntry(id);
		writeFileSync(join(dir, id), 'Edited in Obsidian.');
		const r = saveEntry(id, 'Typed in Whetstone.', e.hash);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.text).toBe('Edited in Obsidian.');
		expect(readFileSync(join(dir, id), 'utf8')).toBe('Edited in Obsidian.');
		if (!r.ok) expect(saveEntry(id, 'Typed in Whetstone.', r.hash).ok).toBe(true);
	});

	it('writes a report into the vault and keeps nothing of it in the database', async () => {
		db.delete(schema.judgeEval).run();
		model.mockResolvedValue(
			reply({
				answer: 'You lean on "just".',
				summary: 'Short sentences.',
				weaknesses: [{ title: 'Same opener', why: 'Every sentence starts with I.', examples: [{ quote: 'I just walked.', better: ['Walking, I…'] }] }],
				words: [{ word: 'amble', meaning: 'walk slowly', instead_of: 'walked', example: 'We ambled home.' }],
				structures: [],
				spelling: [{ wrong: 'didnt', right: "didn't" }],
				exercises: [{ title: 'Ban "just"', instruction: 'Rewrite the entry without it.' }]
			})
		);
		const name = await generateReport(['Journal/2026/26.10/2026-10-22.md', 'Journal/Voice Journals/2026-10-23.md'], 'Look at my openers', Date.parse('2026-10-24T22:05:00Z'));
		expect(name).toBe('2026-10-24 2305');
		const md = readReport(name);
		expect(md).toContain('entries: Journal/2026/26.10/2026-10-22.md, Journal/Voice Journals/2026-10-23.md');
		expect(md).toContain('> Look at my openers');
		expect(md).toContain('- **amble**: walk slowly');
		expect(md).toContain('### Spoken (voice transcripts)');
		expect(md).not.toContain('AI words');
		const sent = JSON.stringify(model.mock.calls[0][0].messages);
		expect(sent).toContain('SECRET-A');
		expect(sent).not.toContain('SECRET-B');
		expect(sent).not.toContain('AI words');
		const rows = db.select().from(schema.judgeEval).all();
		expect(rows.length).toBe(1);
		expect(rows[0].rawResponse).toBe('');
		expect(rows[0].parsed).toBeNull();
		expect(listReports()[0]).toMatchObject({ name, created: '2026-10-24 23:05' });
	});

	it('turns a scope into entries, oldest first', () => {
		const metas = listEntries();
		const ids = (s: Parameters<typeof applyScope>[1]) => applyScope(metas, s).map((m) => m.id);
		expect(ids({ ranges: [{ from: '2026-10-01', to: '2026-10-31' }], kinds: [], last: null })).toEqual([
			'Journal/2026/26.10/2026-10-22.md',
			'Journal/2026/26.10/2026-10-23.md',
			'Journal/Voice Journals/2026-10-23.md'
		]);
		expect(ids({ ranges: [{ from: '2026-10-23', to: '2026-10-22' }], kinds: ['voice'], last: null })).toEqual(['Journal/Voice Journals/2026-10-23.md']);
		expect(ids({ ranges: [], kinds: ['written'], last: 1 })).toEqual(['Journal/2026/26.10/2026-10-23.md']);
		expect(ids({ ranges: [], kinds: [], last: null })).toEqual([]);
	});

	it('finds the entries a request names, sending the model no entry to do it', async () => {
		db.delete(schema.judgeEval).run();
		model.mockReset();
		model.mockResolvedValueOnce(reply({ ranges: [{ from: '2026-10-23', to: '2026-10-23' }], kinds: ['written'], last: null }));
		model.mockResolvedValueOnce(reply({ answer: 'Fine.', summary: 'Short.' }));
		const name = await generateReport([], 'Yesterday only, the written one. Look at my openers.', Date.parse('2026-10-24T22:05:00Z'));
		const scopeCall = JSON.parse(String(model.mock.calls[0][0].messages[1].content));
		expect(scopeCall).toMatchObject({ today: '2026-10-24', weekday: 'Saturday', first_day: '2026-10-22', last_day: '2026-10-23' });
		expect(JSON.stringify(model.mock.calls[0][0].messages)).not.toContain('SECRET');
		const reportCall = JSON.stringify(model.mock.calls[1][0].messages);
		expect(reportCall).toContain('SECRET-B');
		expect(reportCall).not.toContain('SECRET-A');
		expect(readReport(name)).toContain('entries: Journal/2026/26.10/2026-10-23.md\n');
		expect(db.select().from(schema.judgeEval).all().every((r) => r.rawResponse === '')).toBe(true);
	});

	it('says so when a request names no entries', async () => {
		model.mockReset();
		model.mockResolvedValueOnce(reply({ ranges: [], kinds: [], last: null }));
		await expect(generateReport([], 'Help me sound less flat.')).rejects.toMatchObject({ status: 400 });
		await expect(generateReport([], '  ')).rejects.toMatchObject({ status: 400 });
		await expect(generateReport([], 'x'.repeat(4001))).rejects.toMatchObject({ status: 400 });
	});

	it('asks again when the model names a day that does not exist', async () => {
		model.mockReset();
		model.mockResolvedValueOnce(reply({ ranges: [{ from: '2026-10-01', to: '2026-13-45' }], kinds: [], last: null }));
		model.mockResolvedValueOnce(reply({ ranges: [{ from: '2026-10-22', to: '2026-10-22' }], kinds: [], last: null }));
		model.mockResolvedValueOnce(reply({ answer: 'Fine.' }));
		const name = await generateReport([], 'The 22nd.', Date.parse('2026-10-24T22:05:00Z'));
		expect(model.mock.calls.length).toBe(3);
		expect(readReport(name)).toContain('entries: Journal/2026/26.10/2026-10-22.md\n');
	});

	it('logs wording requests in a monthly vault file', async () => {
		model.mockResolvedValue(reply({ options: [{ text: 'linen', note: 'the fabric' }, { text: 'bedsheets' }] }));
		const r = await wording({ selection: '', sentence: 'under these sheets', want: 'the cloth you sleep under' }, Date.parse('2026-10-24T22:05:00Z'));
		expect(r.options[0].text).toBe('linen');
		const f = join(dir, 'Whetstone/Wording/2026-10.md');
		expect(existsSync(f)).toBe(true);
		expect(readFileSync(f, 'utf8')).toContain('meaning "the cloth you sleep under" → linen; bedsheets');
		expect(readdirSync(join(dir, 'Whetstone'))).toEqual(['Wording']);
	});
});
