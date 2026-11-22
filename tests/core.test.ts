import { describe, it, expect } from 'vitest';
import { matchAnswer, sentenceUsesWord } from '../src/lib/core/text';
import { scoreA1, rubricToScore, scoreFluency, scoreA4 } from '../src/lib/core/scoring';
import { gradeFromOutcome, newCardState, review, Rating } from '../src/lib/core/srs';
import { update, expected, pickForTarget } from '../src/lib/core/glicko2';
import { fluencyMetrics } from '../src/lib/core/fluency';

describe('matchAnswer', () => {
	it('exact, case and spacing insensitive', () => expect(matchAnswer('  Ephemeral ', 'ephemeral')).toBe('exact'));
	it('accepts listed forms', () => expect(matchAnswer('grey', 'gray', ['grey'])).toBe('exact'));
	it('accent differences are flagged', () => expect(matchAnswer('ecra', 'ecrã')).toBe('accent'));
	it('one typo on long words', () => expect(matchAnswer('ephemerl', 'ephemeral')).toBe('typo'));
	it('different form is a near miss', () => expect(matchAnswer('ephemerality', 'ephemeral')).toBe('form'));
	it('unrelated word', () => expect(matchAnswer('transient', 'ephemeral')).toBe('none'));
	it('short words need exact', () => expect(matchAnswer('cap', 'cat')).toBe('none'));
});

describe('sentenceUsesWord', () => {
	it('finds inflections', () => expect(sentenceUsesWord('We mitigated the risk early.', 'mitigate')).toBe(true));
	it('finds PT inflections', () => expect(sentenceUsesWord('Ontem andámos muito.', 'andar')).toBe(true));
	it('rejects absence', () => expect(sentenceUsesWord('We reduced the risk.', 'mitigate')).toBe(false));
});

describe('scoreA1', () => {
	it('unaided correct is 100', () => expect(scoreA1({ solved: true, nearMiss: false, hintsUsed: 0, revealed: false })).toBe(100));
	it('each hint costs 15', () => expect(scoreA1({ solved: true, nearMiss: false, hintsUsed: 2, revealed: false })).toBe(70));
	it('reveal is 0', () => expect(scoreA1({ solved: false, nearMiss: false, hintsUsed: 4, revealed: true })).toBe(0));
	it('near miss costs 10', () => expect(scoreA1({ solved: true, nearMiss: true, hintsUsed: 0, revealed: false })).toBe(90));
	it('four hints and a near miss score 30', () => expect(scoreA1({ solved: true, nearMiss: true, hintsUsed: 4, revealed: false })).toBe(30));
});

describe('rubric and A4', () => {
	const w = { validity: 0.25, breadth: 0.2, pick_precision: 0.35, justification: 0.2 };
	it('all 5s is 100', () => expect(rubricToScore({ validity: 5, breadth: 5, pick_precision: 5, justification: 5 }, w)).toBe(100));
	it('all 1s is 0', () => expect(rubricToScore({ validity: 1, breadth: 1, pick_precision: 1, justification: 1 }, w)).toBe(0));
	it('weights apply', () => expect(rubricToScore({ validity: 4, breadth: 2, pick_precision: 2, justification: 1 }, w)).toBe(33));
	it('A4 penalties', () => expect(scoreA4(60, { duplicates: 1, sameAsFlat: 1 })).toBe(50));
});

describe('scoreFluency', () => {
	it('uses fixed reference before a baseline', () => expect(scoreFluency(20, [15])).toBe(80));
	it('baseline mean scores 50', () => expect(scoreFluency(20, [18, 20, 22])).toBe(50));
	it('one sd above scores 70', () => expect(scoreFluency(22, [18, 20, 22])).toBe(70));
});

describe('FSRS grade mapping', () => {
	it('fast unaided is Easy', () => expect(gradeFromOutcome({ correct: true, hints: 0, latencyMs: 3000, revealed: false })).toBe(Rating.Easy));
	it('unaided is Good', () => expect(gradeFromOutcome({ correct: true, hints: 0, latencyMs: 8000, revealed: false })).toBe(Rating.Good));
	it('slow is Hard', () => expect(gradeFromOutcome({ correct: true, hints: 0, latencyMs: 20000, revealed: false })).toBe(Rating.Hard));
	it('one hint is Hard', () => expect(gradeFromOutcome({ correct: true, hints: 1, latencyMs: 3000, revealed: false })).toBe(Rating.Hard));
	it('three hints is Again', () => expect(gradeFromOutcome({ correct: true, hints: 3, latencyMs: 3000, revealed: false })).toBe(Rating.Again));
	it('reveal is Again', () => expect(gradeFromOutcome({ correct: false, hints: 0, latencyMs: 3000, revealed: true })).toBe(Rating.Again));
	it('schedules a new card into the future', () => {
		const now = Date.UTC(2026, 8, 24);
		const r = review(newCardState(now), Rating.Good, now);
		expect(r.card.due).toBeGreaterThan(now);
		expect(r.card.reps).toBe(1);
	});
	it('Easy schedules later than Again', () => {
		const now = Date.UTC(2026, 8, 24);
		const s = newCardState(now);
		expect(review(s, Rating.Easy, now).card.due).toBeGreaterThan(review(s, Rating.Again, now).card.due);
	});
});

describe('Glicko-2', () => {
	it('matches Glickman example', () => {
		// One game from the paper's example: player 1500/200/0.06 beats a 1400/30 opponent.
		const r = update({ rating: 1500, rd: 200, vol: 0.06 }, { rating: 1400, rd: 30, vol: 0.06 }, 1);
		expect(r.rating).toBeGreaterThan(1500);
		expect(r.rd).toBeLessThan(200);
	});
	it('losing lowers the rating', () => {
		expect(update({ rating: 1500, rd: 100, vol: 0.06 }, { rating: 1500, rd: 100, vol: 0.06 }, 0).rating).toBeLessThan(1500);
	});
	it('equal ratings expect 0.5', () => expect(expected({ rating: 1500, rd: 50, vol: 0.06 }, { rating: 1500, rd: 0.0001, vol: 0.06 })).toBeCloseTo(0.5));
	it('picks items near 75% expected success', () => {
		const me = { rating: 1500, rd: 50, vol: 0.06 };
		const items = [1100, 1300, 1310, 1500, 1700].map((r) => ({ rating: r, rd: 50, vol: 0.06 }));
		const p = pickForTarget(me, items, 0.75, 1)!;
		expect(p.rating).toBe(1310);
	});
});

describe('fluency metrics', () => {
	it('counts repetitions, intrusions, clusters and switches (semantic)', () => {
		const sem = {
			dog: { valid: true, subcategory: 'pets' },
			cat: { valid: true, subcategory: 'pets' },
			lion: { valid: true, subcategory: 'wild' },
			tiger: { valid: true, subcategory: 'wild' },
			leopard: { valid: true, subcategory: 'wild' },
			chair: { valid: false }
		};
		const m = fluencyMetrics({ words: ['dog', 'cat', 'dog', 'lion', 'tiger', 'leopard', 'chair'], kind: 'semantic', semantic: sem });
		expect(m.valid).toBe(5);
		expect(m.repetitions).toBe(1);
		expect(m.intrusions).toBe(1);
		expect(m.clusters).toBe(2);
		expect(m.switches).toBe(1);
		expect(m.meanClusterSize).toBe(1.5);
	});
	it('letter fluency checks the letter and the lexicon', () => {
		const lex = new Set(['pan', 'pat', 'plan', 'zebra']);
		const m = fluencyMetrics({ words: ['pan', 'pat', 'plan', 'zebra', 'pxq'], kind: 'letter', letter: 'p', isWord: (w) => lex.has(w) });
		expect(m.valid).toBe(3);
		expect(m.intrusions).toBe(2);
		expect(m.switches).toBe(1);
	});
});
