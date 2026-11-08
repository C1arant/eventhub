import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as schema from './schema';

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

function migrationsDir(): string {
	const dir = resolve(process.env.MIGRATIONS_DIR ?? resolve(process.cwd(), 'drizzle'));
	if (!existsSync(dir)) {
		throw new Error(
			`Migrations directory not found: ${dir}. Run from the project root or set MIGRATIONS_DIR.`
		);
	}
	return dir;
}

export function openDb(path: string): DB {
	const folder = migrationsDir();
	const sqlite = new Database(path);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: folder });
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
