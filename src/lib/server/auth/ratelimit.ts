import { eq } from 'drizzle-orm';
import type { DB } from '../db';
import { loginAttempts } from '../db/schema';

const THRESHOLD = 5;
const MAX_LOCK_SEC = 900;

export function checkLimit(
	db: DB,
	key: string,
	now: number
): { allowed: boolean; retryAfterSec: number } {
	const row = db.select().from(loginAttempts).where(eq(loginAttempts.key, key)).get();
	if (!row || row.lockedUntil <= now) return { allowed: true, retryAfterSec: 0 };
	return { allowed: false, retryAfterSec: Math.ceil((row.lockedUntil - now) / 1000) };
}

export function recordFailure(db: DB, key: string, now: number): void {
	db.transaction((tx) => {
		const row = tx.select().from(loginAttempts).where(eq(loginAttempts.key, key)).get();
		const failures = (row?.failures ?? 0) + 1;
		const lockSec =
			failures >= THRESHOLD ? Math.min(2 ** (failures - THRESHOLD), MAX_LOCK_SEC) : 0;
		const lockedUntil = lockSec > 0 ? now + lockSec * 1000 : (row?.lockedUntil ?? 0);
		tx.insert(loginAttempts)
			.values({ key, failures, lockedUntil })
			.onConflictDoUpdate({ target: loginAttempts.key, set: { failures, lockedUntil } })
			.run();
	});
}

export function recordSuccess(db: DB, key: string): void {
	db.delete(loginAttempts).where(eq(loginAttempts.key, key)).run();
}
