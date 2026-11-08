import { eq, sql } from 'drizzle-orm';
import type { DB } from '../db';
import { invites, users } from '../db/schema';
import { hashToken, newToken } from '../util/tokens';
import { hashPassword } from './password';

export type User = {
	id: number;
	email: string;
	name: string;
	role: 'owner' | 'crew';
	personId: number | null;
};

const INVITE_TTL_MS = 7 * 86_400_000;

const normEmail = (e: string) => e.trim().toLowerCase();

function toUser(r: typeof users.$inferSelect): User {
	return { id: r.id, email: r.email, name: r.name, role: r.role, personId: r.personId };
}

export function hasOwner(db: DB): boolean {
	return !!db.select({ id: users.id }).from(users).where(eq(users.role, 'owner')).get();
}

export async function createOwner(
	db: DB,
	input: { email: string; name: string; password: string }
): Promise<User> {
	if (hasOwner(db)) throw new Error('An owner already exists');
	const passwordHash = await hashPassword(input.password);
	// Re-check synchronously with the insert so concurrent setups cannot both win.
	return db.transaction((tx) => {
		if (tx.select({ id: users.id }).from(users).where(eq(users.role, 'owner')).get()) {
			throw new Error('An owner already exists');
		}
		const row = tx
			.insert(users)
			.values({
				email: normEmail(input.email),
				name: input.name,
				passwordHash,
				role: 'owner',
				createdAt: Date.now()
			})
			.returning()
			.get();
		return toUser(row);
	});
}

export function createInvite(
	db: DB,
	input: { email: string; personId?: number },
	now: number
): string {
	const token = newToken();
	db.insert(invites)
		.values({
			tokenHash: hashToken(token),
			email: normEmail(input.email),
			personId: input.personId ?? null,
			expiresAt: now + INVITE_TTL_MS
		})
		.run();
	return token;
}

export async function acceptInvite(
	db: DB,
	token: string,
	input: { name: string; password: string },
	now: number
): Promise<User> {
	const tokenHash = hashToken(token);
	const load = (q: Pick<DB, 'select'>) => {
		const inv = q.select().from(invites).where(eq(invites.tokenHash, tokenHash)).get();
		if (!inv) throw new Error('Invalid invite');
		if (inv.usedAt !== null) throw new Error('Invite already used');
		if (inv.expiresAt <= now) throw new Error('Invite expired');
		return inv;
	};
	load(db); // fail fast before the expensive hash
	const passwordHash = await hashPassword(input.password);
	return db.transaction((tx) => {
		const inv = load(tx);
		const row = tx
			.insert(users)
			.values({
				email: inv.email,
				name: input.name,
				passwordHash,
				role: 'crew',
				personId: inv.personId,
				createdAt: now
			})
			.returning()
			.get();
		tx.update(invites).set({ usedAt: now }).where(eq(invites.id, inv.id)).run();
		return toUser(row);
	});
}

export function getUserByEmail(db: DB, email: string): User | null {
	const row = db
		.select()
		.from(users)
		.where(sql`lower(${users.email}) = ${normEmail(email)}`)
		.get();
	return row ? toUser(row) : null;
}

/** Internal: password hash for login only. Never expose to clients. */
export function getPasswordHashForEmail(db: DB, email: string): string | null {
	const row = db
		.select({ h: users.passwordHash })
		.from(users)
		.where(sql`lower(${users.email}) = ${normEmail(email)}`)
		.get();
	return row?.h ?? null;
}

export function listUsers(db: DB): User[] {
	return db.select().from(users).orderBy(users.id).all().map(toUser);
}

/** Look up an invite without consuming it. Returns null when invalid, used or expired. */
export function peekInvite(db: DB, token: string, now: number): { email: string } | null {
	const inv = db.select().from(invites).where(eq(invites.tokenHash, hashToken(token))).get();
	if (!inv || inv.usedAt !== null || inv.expiresAt <= now) return null;
	return { email: inv.email };
}

/** True if the error is a SQLite UNIQUE constraint failure (possibly wrapped). */
export function isUniqueViolation(e: unknown): boolean {
	for (let err: any = e, i = 0; err && i < 4; err = err.cause, i++) {
		if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint/i.test(err.message ?? ''))
			return true;
	}
	return false;
}
