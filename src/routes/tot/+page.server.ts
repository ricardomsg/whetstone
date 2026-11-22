import { desc } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';

export const load = () => ({ rows: db.select().from(schema.totLog).orderBy(desc(schema.totLog.capturedAt)).limit(100).all() });
