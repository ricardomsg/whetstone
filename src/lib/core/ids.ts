export function newId(prefix = ''): string {
	const r = crypto.getRandomValues(new Uint8Array(10));
	const s = Array.from(r, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
	return prefix ? `${prefix}_${s}` : s;
}

/** Local calendar date (YYYY-MM-DD) in the given IANA zone. */
export function localDate(ms: number, tz: string): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

/** The calendar date n days after a YYYY-MM-DD date (n may be negative). */
export function addDays(date: string, n: number): string {
	return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** The first instant of a calendar date in the given IANA zone, including days when a clock change skips or repeats midnight. */
export function startOfDay(date: string, tz: string): number {
	const DAY = 86_400_000;
	const wall = Date.parse(`${date}T00:00:00Z`);
	const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
	const offset = (t: number) => {
		const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
		return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`) - t;
	};
	const candidates = [wall - offset(wall - DAY), wall - offset(wall + DAY)].filter((t) => localDate(t, tz) === date);
	return candidates.length ? Math.min(...candidates) : wall;
}
