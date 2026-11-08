import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../src/lib/server/db/test-db';
import { assignments, events, guestLinks, people } from '../../src/lib/server/db/schema';
import {
	createDisplayToken, createGuestLink, resolveDisplayToken, resolveGuestToken,
	revokeDisplayToken, revokeGuestLink
} from '../../src/lib/server/auth/guests';
import { can } from '../../src/lib/server/auth/can';
import { hashToken } from '../../src/lib/server/util/tokens';

function setup() {
	const db = createTestDb();
	const mk = (name: string, end: string) =>
		db.insert(events).values({ name, type: 'gig', startDate: end, endDate: end, createdAt: 0 }).returning().get();
	const A = mk('A', '2099-03-10');
	const B = mk('B', '2099-03-10');
	const p = db.insert(people).values({ name: 'p' }).returning().get();
	const asgA = db.insert(assignments).values({ eventId: A.id, personId: p.id }).returning().get();
	return { db, A, B, p, asgA };
}

describe('guest links', () => {
	it('resolves, stores only the hash, and gives a guest actor', () => {
		const { db, A, p, asgA } = setup();
		const token = createGuestLink(db, asgA.id, { liveAccess: true });
		const row = db.select().from(guestLinks).get()!;
		expect(row.tokenHash).toBe(hashToken(token));
		expect(row.tokenHash).not.toBe(token);
		const actor = resolveGuestToken(db, token, Date.now());
		expect(actor).toEqual({
			kind: 'guest', assignmentId: asgA.id, eventId: A.id, personId: p.id, liveAccess: true
		});
		expect(resolveGuestToken(db, 'nope', Date.now())).toBeNull();
	});

	it('default expiry is end date + 7 days 23:59 local', () => {
		const { db, asgA } = setup();
		createGuestLink(db, asgA.id, { liveAccess: false });
		const row = db.select().from(guestLinks).get()!;
		expect(row.expiresAt).toBe(new Date('2099-03-17T23:59:00').getTime());
	});

	it('revoked link stops resolving', () => {
		const { db, asgA } = setup();
		const token = createGuestLink(db, asgA.id, { liveAccess: false });
		const id = db.select().from(guestLinks).get()!.id;
		revokeGuestLink(db, id);
		expect(db.select().from(guestLinks).get()!.revokedAt).not.toBeNull();
		expect(resolveGuestToken(db, token, Date.now())).toBeNull();
	});

	it('expired link stops resolving, explicit expiresAt honoured', () => {
		const { db, asgA } = setup();
		const token = createGuestLink(db, asgA.id, { liveAccess: false, expiresAt: 1000 });
		expect(resolveGuestToken(db, token, 999)).not.toBeNull();
		expect(resolveGuestToken(db, token, 1000)).toBeNull();
		expect(resolveGuestToken(db, token, 5000)).toBeNull();
	});

	it('removing the assignment kills the link immediately', () => {
		const { db, asgA } = setup();
		const token = createGuestLink(db, asgA.id, { liveAccess: true });
		expect(resolveGuestToken(db, token, Date.now())).not.toBeNull();
		db.delete(assignments).where(eq(assignments.id, asgA.id)).run();
		expect(resolveGuestToken(db, token, Date.now())).toBeNull();
	});

	it('token for event A cannot live:view event B', () => {
		const { db, B, asgA } = setup();
		const token = createGuestLink(db, asgA.id, { liveAccess: true });
		const actor = resolveGuestToken(db, token, Date.now())!;
		expect(can(db, actor, 'live:view', { eventId: B.id })).toBe(false);
		expect(can(db, actor, 'live:view', { eventId: actor.eventId })).toBe(true);
	});

	it('throws for unknown assignment', () => {
		const { db } = setup();
		expect(() => createGuestLink(db, 9999, { liveAccess: false })).toThrow();
	});
});

describe('display tokens', () => {
	it('resolves and can be revoked; scoped to event', () => {
		const { db, A, B } = setup();
		const token = createDisplayToken(db, A.id);
		const actor = resolveDisplayToken(db, token)!;
		expect(actor).toEqual({ kind: 'display', eventId: A.id });
		expect(can(db, actor, 'live:view', { eventId: B.id })).toBe(false);
		expect(resolveDisplayToken(db, 'bad')).toBeNull();
		revokeDisplayToken(db, 1);
		expect(resolveDisplayToken(db, token)).toBeNull();
	});
});
