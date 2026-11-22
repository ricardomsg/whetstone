// Deterministic scoring. Every formula that turns an attempt into a 0-100 skill score lives here,
// so trends stay comparable. Change a formula only with a note in docs/scoring.md.

export type A1State = 'correct' | 'synonym' | 'near_miss' | 'wrong' | 'tot' | 'dont_know' | 'revealed';

export interface A1Outcome {
	solved: boolean; // produced the target (or an accepted synonym) before the full reveal
	nearMiss: boolean; // produced a different form of the target
	hintsUsed: number; // hints shown, not counting the reveal
	revealed: boolean;
}

export const HINT_PENALTY = 15;

/** A1: unaided correct 100; each hint costs HINT_PENALTY; a near miss costs 10; a reveal scores 0. */
export function scoreA1(o: A1Outcome, hintPenalty = HINT_PENALTY): number {
	if (o.revealed || !o.solved) return 0;
	const s = 100 - hintPenalty * o.hintsUsed - (o.nearMiss ? 10 : 0);
	return Math.max(10, Math.min(100, s));
}

/** Weighted rubric score (criteria 1-5) → 0-100. */
export function rubricToScore(scores: Record<string, number>, weights: Record<string, number>): number {
	let num = 0,
		den = 0;
	for (const [k, w] of Object.entries(weights)) {
		const s = scores[k];
		if (typeof s !== 'number') continue;
		num += (w * (Math.min(5, Math.max(1, s)) - 1)) / 4;
		den += w;
	}
	return den ? Math.round((100 * num) / den + 1e-9) : 0;
}

/** A4: rubric score minus 5 per duplicated or unchanged alternative. */
export function scoreA4(rubricScore: number, penalties: { duplicates: number; sameAsFlat: number }): number {
	return Math.max(0, rubricScore - 5 * (penalties.duplicates + penalties.sameAsFlat));
}

/**
 * A2: before 3 attempts exist for the same kind and language, score against a fixed reference
 * (25 valid words = 100). Afterwards, against the personal baseline: the baseline mean scores 50,
 * each baseline standard deviation (floored at 2 words) moves it 20 points.
 */
export function scoreFluency(validCount: number, baseline: number[]): number {
	if (baseline.length < 3) return Math.round(Math.min(100, (100 * validCount) / 25));
	const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
	const sd = Math.sqrt(baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / (baseline.length - 1));
	return Math.round(Math.max(0, Math.min(100, 50 + (20 * (validCount - mean)) / Math.max(sd, 2))));
}

/** Resume recall: coverage of the note's points weighted 60/40 prospective over retrospective. */
export function scoreResumeRecall(retrospective: number, prospective: number): number {
	return Math.round(0.4 * retrospective + 0.6 * prospective);
}
