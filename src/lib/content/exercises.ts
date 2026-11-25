import type { Component } from 'svelte';
import MessageCircleQuestion from '@lucide/svelte/icons/message-circle-question-mark';
import Zap from '@lucide/svelte/icons/zap';
import SpellCheck from '@lucide/svelte/icons/spell-check';
import Repeat from '@lucide/svelte/icons/repeat';
import PenLine from '@lucide/svelte/icons/pen-line';
import BookOpen from '@lucide/svelte/icons/book-open';
import Bookmark from '@lucide/svelte/icons/bookmark';
import Undo2 from '@lucide/svelte/icons/undo-2';
import Sun from '@lucide/svelte/icons/sun';
import Trophy from '@lucide/svelte/icons/trophy';
import Lightbulb from '@lucide/svelte/icons/lightbulb';
import MessagesSquare from '@lucide/svelte/icons/messages-square';
import Languages from '@lucide/svelte/icons/languages';

interface ExerciseBase {
	code: string;
	title: string;
	short: string;
	skill: string; // WR FL PR VOC TRA
	skillName: string;
	icon: Component<any>;
	href?: string;
}

export type ExerciseMeta = ExerciseBase & (
	| { kind: 'game'; colour: string; illustration: string; langLabels?: Record<string, string>; setup?: string }
	| { kind: 'activity' }
);

export { PAUSED } from './paused';

export const EXERCISES: Record<string, ExerciseMeta> = {
	A1: { kind: 'game', colour: '#e2b86b', illustration: '/games/definition.svg', setup: '/x/a1/setup', code: 'A1', title: 'Definition → word', short: 'Read the meaning. Find the missing word.', skill: 'WR', skillName: 'Word retrieval', icon: Lightbulb, href: '/x/a1' },
	A2: { kind: 'game', colour: '#f09b86', illustration: '/games/word-rush.svg', code: 'A2', title: 'Word Rush', short: 'One category or letter. How many words in 60 seconds?', skill: 'FL', skillName: 'Verbal fluency', icon: Zap, href: '/x/a2' },
	A4: { kind: 'game', colour: '#bca5ee', illustration: '/games/synonym-ladder.svg', code: 'A4', title: 'Synonym ladder', short: 'Find five alternatives. Pick the most precise.', skill: 'PR', skillName: 'Lexical precision', icon: SpellCheck, href: '/x/a4' },
	A8: { kind: 'game', colour: '#7fb3e8', illustration: '/games/translate.svg', langLabels: { 'pt-PT': 'English → Português', en: 'Português → English' }, code: 'A8', title: 'Translate it', short: 'The English word came. Find the Portuguese one, fast.', skill: 'WR', skillName: 'Word retrieval', icon: Languages, href: '/x/a8' },
	A7: { kind: 'activity', code: 'A7', title: 'Tip of the tongue', short: 'A word you could not find, captured', skill: 'WR', skillName: 'Word retrieval', icon: MessageCircleQuestion },
	B1: { kind: 'activity', code: 'B1', title: 'Word inbox', short: 'A word met while reading', skill: 'VOC', skillName: 'Active vocabulary', icon: BookOpen },
	B2: { kind: 'activity', code: 'B2', title: 'Review', short: 'Recall words saved from games, your inbox and your tip-of-the-tongue log', skill: 'VOC', skillName: 'Active vocabulary', icon: Repeat, href: '/x/b2' },
	B3: { kind: 'activity', code: 'B3', title: 'Use it', short: 'Write sentences with words you confirmed in your inbox', skill: 'VOC', skillName: 'Active vocabulary', icon: PenLine, href: '/x/b3' },
	C1: { kind: 'activity', code: 'C1', title: 'Conversation recap', short: 'Capture what was decided and what is open', skill: 'TRP', skillName: 'Topic recall', icon: MessagesSquare, href: '/capture/recap' },
	C2: { kind: 'activity', code: 'C2', title: 'Delayed recall', short: 'Recall a conversation before looking', skill: 'TRP', skillName: 'Topic recall', icon: MessagesSquare, href: '/threads' },
	C3: { kind: 'activity', code: 'C3', title: 'Re-entry drill', short: 'Pick up a conversation from a vague cue', skill: 'TRP', skillName: 'Topic recall', icon: Undo2, href: '/threads' },
	D1: { kind: 'activity', code: 'D1', title: 'Resume note', short: 'Where you stopped, what comes next', skill: 'TRA', skillName: 'Context resumption', icon: Bookmark },
	D2: { kind: 'activity', code: 'D2', title: 'Resume drill', short: 'Recall where you stopped before opening your work-session note', skill: 'TRA', skillName: 'Context resumption', icon: Undo2 },
	F1: { kind: 'activity', code: 'F1', title: 'Check-in', short: 'Sleep, energy, stress', skill: '', skillName: '', icon: Sun },
	BENCH: { kind: 'activity', code: 'BENCH', title: 'Benchmark', short: 'The fixed test, every four weeks', skill: '', skillName: '', icon: Trophy }
};

export const langLabel = (l: string | null | undefined) => (l === 'pt-PT' ? 'PT' : l === 'en' ? 'EN' : l === 'mixed' ? 'EN+PT' : '');
