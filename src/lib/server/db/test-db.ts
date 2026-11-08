import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type DB } from './index';

/** Fresh, migrated database in its own temp file. */
export function createTestDb(): DB {
	const dir = mkdtempSync(join(tmpdir(), 'eventhub-test-'));
	return openDb(join(dir, 'test.db'));
}
