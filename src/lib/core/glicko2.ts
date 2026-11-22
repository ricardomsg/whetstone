// Glicko-2 (Glickman, 2012) for one-game rating periods. Used for skill ratings and item
// difficulty: an attempt is a "game" between the user's skill rating and the item's rating,
// with a score in [0, 1] (partial credit allowed).

export interface Rating2 {
	rating: number;
	rd: number;
	vol: number;
}

const SCALE = 173.7178;
const TAU = 0.5;

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu: number, muj: number, phij: number) => 1 / (1 + Math.exp(-g(phij) * (mu - muj)));

/** Expected score of a player against an opponent (probability of success on an item). */
export function expected(player: Rating2, opp: Rating2): number {
	return E((player.rating - 1500) / SCALE, (opp.rating - 1500) / SCALE, opp.rd / SCALE);
}

export function update(player: Rating2, opp: Rating2, score: number, opts: { minRd?: number } = {}): Rating2 {
	const mu = (player.rating - 1500) / SCALE;
	const phi = player.rd / SCALE;
	const muj = (opp.rating - 1500) / SCALE;
	const phij = opp.rd / SCALE;
	const gj = g(phij);
	const ej = E(mu, muj, phij);
	const v = 1 / (gj * gj * ej * (1 - ej));
	const delta = v * gj * (score - ej);

	// Volatility iteration (Illinois algorithm).
	const a = Math.log(player.vol * player.vol);
	const f = (x: number) => {
		const ex = Math.exp(x);
		return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (TAU * TAU);
	};
	let A = a;
	let B: number;
	if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
	else {
		let k = 1;
		while (f(a - k * TAU) < 0) k++;
		B = a - k * TAU;
	}
	let fA = f(A),
		fB = f(B);
	for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
		const C = A + ((A - B) * fA) / (fB - fA);
		const fC = f(C);
		if (fC * fB <= 0) {
			A = B;
			fA = fB;
		} else fA = fA / 2;
		B = C;
		fB = fC;
	}
	const vol = Math.exp(A / 2);
	const phiStar = Math.sqrt(phi * phi + vol * vol);
	const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
	const muNew = mu + phiNew * phiNew * gj * (score - ej);
	return {
		rating: muNew * SCALE + 1500,
		rd: Math.max(opts.minRd ?? 30, phiNew * SCALE),
		vol
	};
}

/**
 * Pick the candidate whose expected success is closest to the target (default 0.75),
 * sampling among the best few so the same item does not always win.
 */
export function pickForTarget<T extends Rating2>(player: Rating2, items: T[], target = 0.75, spread = 5, rand = Math.random): T | undefined {
	if (!items.length) return undefined;
	const ranked = items
		.map((it) => ({ it, d: Math.abs(expected(player, it) - target) }))
		.sort((x, y) => x.d - y.d)
		.slice(0, spread);
	return ranked[Math.floor(rand() * ranked.length)].it;
}

/** Initial item rating from its features, before any attempt has calibrated it. */
export function initialItemRating(f: { band?: number | null; pos?: string | null; concreteness?: string | null }): number {
	let r = 1500 + ((f.band ?? 2) - 2) * 150;
	if (f.pos === 'verb') r += 30;
	if (f.concreteness === 'abstract') r += 50;
	return r;
}
