import { beforeEach, expect, it } from 'vitest';
import { db, schema } from '../src/lib/server/db';
import { sessions, openDrill, answerDrill } from '../src/lib/server/exercises/resume';
import { saveSettings } from '../src/lib/server/settings';
import { load } from '../src/routes/sessions/[id]/+page.server';
import { load as latestNote } from '../src/routes/sessions/note/+page.server';

const pageData = (query = '') => load({ params: { id: 'work' }, url: new URL(`http://test/sessions/work${query}`) } as Parameters<typeof load>[0]);

beforeEach(() => {
	db.delete(schema.workSession).run();
	db.delete(schema.resumeNote).run();
	saveSettings({ resumePrompting: true, llm: { 'd2-resume-recall': false } });
	db.insert(schema.workSession).values({ id: 'work', source: 'manual', title: 'Work', lastActivity: 10 }).run();
	db.insert(schema.resumeNote).values({ id: 'note', sessionId: 'work', stoppedAt: 'HIDDEN-ANSWER', nextAction: 'HIDDEN-NEXT', quality: { score: 80, tips: ['HIDDEN-TIP'] } }).run();
});

it('sends only note metadata in session lists', () => {
	const list = sessions();
	expect(list[0].note?.quality?.score).toBe(80);
	expect(JSON.stringify(list)).not.toContain('HIDDEN');
});

it('keeps notes out of recall and note-writing page data; explicit viewing still works', () => {
	for (const query of ['?resume=1', '?note=1']) {
		const page = pageData(query);
		expect(page.hasNote).toBe(true);
		expect(JSON.stringify(page)).not.toContain('HIDDEN');
	}
	expect(pageData().notes[0].stoppedAt).toBe('HIDDEN-ANSWER');
	saveSettings({ resumePrompting: false });
	const page = pageData('?resume=1');
	expect(page.mode).toBe('view');
	expect(page.notes[0].stoppedAt).toBe('HIDDEN-ANSWER');
});

it('returns the saved answer only after recall is submitted', async () => {
	const drill = await openDrill('work');
	expect(JSON.stringify(drill)).not.toContain('HIDDEN');
	const result = await answerDrill(drill.drillId, 'What I remember', 'My next step');
	expect(result.truth?.stoppedAt).toBe('HIDDEN-ANSWER');
});

it('opens a note for the latest active work session, skipping archived and automated sessions', () => {
	db.insert(schema.workSession).values([
		{ id: 'old', source: 'manual', lastActivity: 1 },
		{ id: 'archived', source: 'manual', lastActivity: 30, archived: true },
		{ id: 'agent', source: 'claude_code', title: 'Agent', lastActivity: 20, projectPath: '/home/user/.local/agent' }
	]).run();
	expect(() => latestNote()).toThrow(expect.objectContaining({ status: 303, location: '/sessions/work?note=1' }));
	db.delete(schema.workSession).run();
	expect(() => latestNote()).toThrow(expect.objectContaining({ status: 303, location: '/sessions#new-session' }));
});
