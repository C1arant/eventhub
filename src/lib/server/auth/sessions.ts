import { eq } from 'drizzle-orm';
import type { DB } from '../db';
import { sessions, users } from '../db/schema';
import { hashToken, newToken } from '../util/tokens';
import type { User } from './users';

const DAY = 86_400_000;
export const SESSION_TTL_MS = 30 * DAY;
const REFRESH_BELOW_MS = 29 * DAY;

export function createSession(db: DB, userId: number, now = Date.now()): string {
	const token = newToken();
	db.insert(sessions)
		.values({ id: hashToken(token), userId, expiresAt: now + SESSION_TTL_MS })
		.run();
	return token;
}

export function validateSession(db: DB, token: string, now = Date.now()): User | null {
	return validateSessionWithRefresh(db, token, now).user;
}

/** Like validateSession, but also reports whether the expiry was slid forward. */
export function validateSessionWithRefresh(
	db: DB,
	token: string,
	now = Date.now()
): { user: User | null; refreshed: boolean } {
	const id = hashToken(token);
	const row = db
		.select({
			expiresAt: sessions.expiresAt,
			id: users.id,
			email: users.email,
			name: users.name,
			role: users.role,
			personId: users.personId
		})
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.id, id))
		.get();
	if (!row) return { user: null, refreshed: false };
	if (row.expiresAt <= now) {
		db.delete(sessions).where(eq(sessions.id, id)).run();
		return { user: null, refreshed: false };
	}
	let refreshed = false;
	if (row.expiresAt - now < REFRESH_BELOW_MS) {
		refreshed = true;
		db.update(sessions)
			.set({ expiresAt: now + SESSION_TTL_MS })
			.where(eq(sessions.id, id))
			.run();
	}
	return {
		user: {
			id: row.id,
			email: row.email,
			name: row.name,
			role: row.role,
			personId: row.personId
		},
		refreshed
	};
}

export function deleteSession(db: DB, token: string): void {
	db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}

export function deleteAllSessions(db: DB, userId: number): void {
	db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

/** Read-only session check: validates without sliding the expiry or deleting anything (for heartbeats). */
export function peekSession(db: DB, token: string, now = Date.now()): User | null {
	const row = db
		.select({
			expiresAt: sessions.expiresAt,
			id: users.id,
			email: users.email,
			name: users.name,
			role: users.role,
			personId: users.personId
		})
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.id, hashToken(token)))
		.get();
	if (!row || row.expiresAt <= now) return null;
	return { id: row.id, email: row.email, name: row.name, role: row.role, personId: row.personId };
}
