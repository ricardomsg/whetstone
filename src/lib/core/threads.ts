import { Rating } from './srs';

/** A typed re-entry gets full speed credit through 10 s and none at 60 s. */
export function reentrySpeed(elapsedMs: number): number {
	return Math.round(Math.max(0, Math.min(100, 100 * (60_000 - elapsedMs) / 50_000)));
}

export function reentryScore(rubricScore: number, elapsedMs: number): number {
	return Math.round(0.8 * rubricScore + 0.2 * reentrySpeed(elapsedMs));
}

export function threadGrade(score: number) {
	return score >= 90 ? Rating.Easy : score >= 75 ? Rating.Good : score >= 50 ? Rating.Hard : Rating.Again;
}
