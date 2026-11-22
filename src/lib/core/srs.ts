import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs';

export { Rating };
export type GradeName = 'again' | 'hard' | 'good' | 'easy';
export const GRADE_NAMES: Record<number, GradeName> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };

export interface ReviewOutcome {
	correct: boolean; // produced the word (exact, accent or typo match, or accepted synonym)
	hints: number; // hints shown before answering
	latencyMs: number; // from prompt shown to answer submitted
	revealed: boolean;
}

/**
 * The grade mapping shown on every review, with an override:
 *  - revealed, wrong, or 3+ hints            → Again
 *  - 1-2 hints, or correct but slower than 15 s → Hard
 *  - unaided and faster than 5 s             → Easy
 *  - unaided otherwise                       → Good
 */
export function gradeFromOutcome(o: ReviewOutcome): Grade {
	if (o.revealed || !o.correct || o.hints >= 3) return Rating.Again;
	if (o.hints > 0 || o.latencyMs > 15_000) return Rating.Hard;
	if (o.latencyMs < 5_000) return Rating.Easy;
	return Rating.Good;
}

const scheduler = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9 }));

export type StoredCard = Omit<Card, 'due' | 'last_review'> & { due: number; last_review?: number };

function toStored(c: Card): StoredCard {
	return { ...c, due: +c.due, last_review: c.last_review ? +c.last_review : undefined };
}
function fromStored(s: StoredCard): Card {
	return { ...s, due: new Date(s.due), last_review: s.last_review ? new Date(s.last_review) : undefined } as Card;
}

export function newCardState(now = Date.now()): StoredCard {
	return toStored(createEmptyCard(new Date(now)));
}

export function review(state: StoredCard, grade: Grade, now = Date.now()) {
	const r = scheduler.next(fromStored(state), new Date(now), grade);
	return { card: toStored(r.card), log: { ...r.log, due: +r.log.due, review: +r.log.review } };
}
