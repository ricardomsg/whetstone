export async function post<T = any>(url: string, body: unknown = {}): Promise<T> {
	const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`);
	return data as T;
}

export function fmtMs(ms: number | null | undefined): string {
	if (ms == null) return '—';
	return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

export const LANGS = [
	{ v: 'en', l: 'English' },
	{ v: 'pt-PT', l: 'Português' }
];
