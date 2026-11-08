// Consistent online backup: SQLite via better-sqlite3 .backup() + a copy of data/uploads.
// Run: docker compose exec -u node app node scripts/backup.mjs   (or locally: node scripts/backup.mjs)
import Database from 'better-sqlite3';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { foldersToPrune, localDate } from './backup-lib.mjs';

const dataDir = resolve(process.env.DATA_DIR ?? './data');
const backupsDir = resolve(process.env.BACKUPS_DIR ?? './backups');
const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 14);
const today = localDate();
const dest = join(backupsDir, today);

mkdirSync(dest, { recursive: true });

const db = new Database(join(dataDir, 'eventhub.db'), { readonly: true, fileMustExist: true });
try {
	await db.backup(join(dest, 'eventhub.db'));
} finally {
	db.close();
}

const uploads = join(dataDir, 'uploads');
if (existsSync(uploads)) cpSync(uploads, join(dest, 'uploads'), { recursive: true });

for (const name of foldersToPrune(readdirSync(backupsDir), today, keepDays)) {
	rmSync(join(backupsDir, name), { recursive: true, force: true });
	console.log(`pruned ${name}`);
}
console.log(`backup written to ${dest}`);
