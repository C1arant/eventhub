import { and, eq, isNull } from 'drizzle-orm';
import type { DB } from '../db';
import { assignments, displayTokens, events, guestLinks } from '../db/schema';
import { addDays } from '../util/dates';
import { hashToken, newToken } from '../util/tokens';
import type { DisplayActor, GuestActor } from './can';

/** Default expiry: end date + 7 days, 23:59 in the server's local timezone. */
function defaultExpiry(endDate: string): number {
	return new Date(`${addDays(endDate, 7)}T23:59:00`).getTime();
}

export function createGuestLink(
	db: DB,
	assignmentId: number,
	opts: { liveAccess: boolean; contactPersonId?: number | null; expiresAt?: number }
): string {
	const row = db
		.select({ endDate: events.endDate })
		.from(assignments)
		.innerJoin(events, eq(events.id, assignments.eventId))
		.where(eq(assignments.id, assignmentId))
		.get();
	if (!row) throw new Error('Assignment not found');
	const token = newToken();
	db.insert(guestLinks)
		.values({
			assignmentId,
			tokenHash: hashToken(token),
			expiresAt: opts.expiresAt ?? defaultExpiry(row.endDate),
			liveAccess: opts.liveAccess,
			contactPersonId: opts.contactPersonId ?? null
		})
		.run();
	return token;
}

export function resolveGuestToken(db: DB, token: string, now: number): GuestActor | null {
	// Inner join on assignments: a removed assignment means no row, so no access.
	const r = db
		.select({
			assignmentId: assignments.id,
			eventId: assignments.eventId,
			personId: assignments.personId,
			liveAccess: guestLinks.liveAccess,
			expiresAt: guestLinks.expiresAt,
			revokedAt: guestLinks.revokedAt
		})
		.from(guestLinks)
		.innerJoin(assignments, eq(assignments.id, guestLinks.assignmentId))
		.where(eq(guestLinks.tokenHash, hashToken(token)))
		.get();
	if (!r) return null;
	if (r.revokedAt !== null) return null;
	if (now >= r.expiresAt) return null;
	return {
		kind: 'guest',
		assignmentId: r.assignmentId,
		eventId: r.eventId,
		personId: r.personId,
		liveAccess: r.liveAccess
	};
}

export function revokeGuestLink(db: DB, linkId: number): void {
	db.update(guestLinks)
		.set({ revokedAt: Date.now() })
		.where(and(eq(guestLinks.id, linkId), isNull(guestLinks.revokedAt)))
		.run();
}

export function createDisplayToken(db: DB, eventId: number): string {
	const token = newToken();
	db.insert(displayTokens)
		.values({ eventId, tokenHash: hashToken(token), createdAt: Date.now() })
		.run();
	return token;
}

export function resolveDisplayToken(db: DB, token: string): DisplayActor | null {
	const r = db
		.select({ eventId: displayTokens.eventId, revokedAt: displayTokens.revokedAt })
		.from(displayTokens)
		.where(eq(displayTokens.tokenHash, hashToken(token)))
		.get();
	if (!r || r.revokedAt !== null) return null;
	return { kind: 'display', eventId: r.eventId };
}

export function revokeDisplayToken(db: DB, id: number): void {
	db.update(displayTokens)
		.set({ revokedAt: Date.now() })
		.where(and(eq(displayTokens.id, id), isNull(displayTokens.revokedAt)))
		.run();
}

export function listDisplayTokens(db: DB, eventId: number) {
	return db
		.select({ id: displayTokens.id, createdAt: displayTokens.createdAt })
		.from(displayTokens)
		.where(and(eq(displayTokens.eventId, eventId), isNull(displayTokens.revokedAt)))
		.all();
}
