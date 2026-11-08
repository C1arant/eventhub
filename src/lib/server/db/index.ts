import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as schema from './schema';

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const MIGRATIONS = resolve(process.cwd(), 'drizzle');

export function openDb(path: string): DB {
	const sqlite = new Database(path);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS });
	return db;
}

export function dataDir(): string {
	return resolve(process.env.DATA_DIR ?? './data');
}

let singleton: DB | undefined;

export function getDb(): DB {
	if (!singleton) {
		const dir = dataDir();
		mkdirSync(dir, { recursive: true });
		singleton = openDb(resolve(dir, 'eventhub.db'));
	}
	return singleton;
}

export { schema };
