import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '../env';
import * as schema from './schema';

mkdirSync(env.dataDir, { recursive: true });
export const sqlite = new Database(process.env.WS_DB_PATH ?? join(env.dataDir, 'whetstone.db'));
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: env.migrationsDir });
export { schema };
