import { journalAvailable, listEntries, readEntry, todayId } from '$lib/server/journal/store';

export const load = ({ url }) => {
	if (!journalAvailable()) return { available: false as const };
	const metas = listEntries();
	const today = todayId();
	const id = url.searchParams.get('e') || today;
	const entry = readEntry(id);
	// Neighbours in time, written and voice together; today's entry may not exist yet, so it sits before the newest.
	const ids = metas.map((m) => m.id);
	const at = ids.indexOf(id);
	const newer = at > 0 ? metas[at - 1] : null;
	const older = at >= 0 ? (metas[at + 1] ?? null) : (metas.find((m) => m.day < entry.day || (m.day === entry.day && m.id !== id)) ?? null);
	return {
		available: true as const,
		entry,
		today,
		isToday: id === today,
		newer: newer && { id: newer.id, title: newer.title, kind: newer.kind },
		older: older && { id: older.id, title: older.title, kind: older.kind },
		metas: metas.map((m) => ({ id: m.id, day: m.day, title: m.title, kind: m.kind, bytes: m.bytes }))
	};
};
