import { error } from '@sveltejs/kit';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { sqlite } from '$lib/server/db';
import { env } from '$lib/server/env';
import { localDate } from '$lib/server/dates';
import { EXPORT_TABLES, exportCsv } from '$lib/server/export';

export const GET = async ({ params }) => {
	const d = localDate();
	if (params.kind === 'backup') {
		const p = join(env.dataDir, `export-${Date.now()}.db`);
		await sqlite.backup(p);
		const buf = readFileSync(p);
		rmSync(p);
		return new Response(buf, { headers: { 'content-type': 'application/vnd.sqlite3', 'content-disposition': `attachment; filename="whetstone-${d}.db"` } });
	}
	if (params.kind === 'json') {
		const out = sqlite.transaction(() => Object.fromEntries(EXPORT_TABLES.map((t) => [t, sqlite.prepare(`SELECT * FROM ${t}`).all()])))();
		return new Response(JSON.stringify(out, null, 1), { headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="whetstone-${d}.json"` } });
	}
	if (params.kind === 'csv') {
		return new Response(Buffer.from(exportCsv()), { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="whetstone-${d}-csv.zip"` } });
	}
	error(404, 'unknown export');
};
