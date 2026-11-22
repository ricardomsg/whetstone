import { pickForTarget, type Rating2 } from './glicko2';

// Which item to show next. Rule: an item you have seen does not come back
// until you have been through the rest of the roster. Among the items still allowed, pick the one
// nearest the target success rate, as before.
//
//   1. Items never shown come first.
//   2. Once every item has been shown, repeats start with the ones seen longest ago
//      (the oldest quarter, at least five), and never inside the cooldown unless nothing else is left.
//   3. Personal items (from the TOT log or the word inbox) get a 30% preference when eligible.

export interface Candidate extends Rating2 {
	id: string;
	source: string;
}

export interface SelectOptions {
	now?: number;
	cooldownMs?: number;
	preferSources?: string[];
	rand?: () => number;
}

export interface Selection<T> {
	item: T | undefined;
	fresh: boolean; // never shown before
	seen: number; // how many of the candidates have been shown at least once
	total: number;
}

export function selectFresh<T extends Candidate>(candidates: T[], lastSeen: Map<string, number>, player: Rating2, o: SelectOptions = {}): Selection<T> {
	const now = o.now ?? Date.now();
	const rand = o.rand ?? Math.random;
	const seen = candidates.filter((c) => lastSeen.has(c.id)).length;
	const base = { seen, total: candidates.length };
	if (!candidates.length) return { item: undefined, fresh: false, ...base };

	const unseen = candidates.filter((c) => !lastSeen.has(c.id));
	let pool: T[];
	let fresh = false;
	if (unseen.length) {
		pool = unseen;
		fresh = true;
	} else {
		const byAge = [...candidates].sort((a, b) => lastSeen.get(a.id)! - lastSeen.get(b.id)!);
		const eligible = byAge.filter((c) => now - lastSeen.get(c.id)! >= (o.cooldownMs ?? 0));
		const from = eligible.length ? eligible : byAge;
		pool = from.slice(0, Math.max(5, Math.ceil(from.length / 4)));
	}
	if (o.preferSources?.length && rand() < 0.3) {
		const personal = pool.filter((p) => o.preferSources!.includes(p.source));
		if (personal.length) pool = personal;
	}
	return { item: pickForTarget(player, pool, 0.75, 5, rand), fresh, ...base };
}
