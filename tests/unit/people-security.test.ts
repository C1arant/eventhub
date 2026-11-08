import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createInvite, createOwner } from '../../src/lib/server/auth/users';
import { createTestDb } from '../../src/lib/server/db/test-db';
import { assignments, guestLinks, invites, users } from '../../src/lib/server/db/schema';
import { createEvent, eventInput, listDays } from '../../src/lib/server/events';
import { hashToken } from '../../src/lib/server/util/tokens';
import {
	assign, assignmentInEvent, callSheet, contactEligible, createLinkFor, createPerson, deletePerson,
	getPerson, guestLinkInEvent, inviteEligibility, linkLogin, listEventPeople, listGuestLinks, personInput, setDayCallTime
} from '../../src/lib/server/people';

type Db = ReturnType<typeof createTestDb>;
const ev = (db: Db, name = 'Show') =>
	createEvent(db, eventInput.parse({ name, type: 'gig', startDate: '2026-12-01', endDate: '2026-12-03' }));
const person = (db: Db, name: string, extra: Record<string, unknown> = {}) =>
	createPerson(db, personInput.parse({ name, ...extra }));
const future = () => Date.now() + 86_400_000;

describe('crew payloads omit private fields', () => {
	it('callSheet and listEventPeople without includePrivate carry no needs or email', () => {
		const db = createTestDb();
		const e = ev(db);
		const p = person(db, 'Ann', { email: 'ann-secret@x.dev', needs: 'peanut-allergy-secret', phone: '0777' });
		const a = assign(db, e, p, { eventRole: 'FOH', callTime: '10:00' });
		setDayCallTime(db, a, listDays(db, e)[0].id, '09:00');
		const crew = JSON.stringify([callSheet(db, e, { includePrivate: false }), listEventPeople(db, e, { includePrivate: false })]);
		expect(crew).not.toContain('secret');
		expect(crew).not.toContain('needs');
		expect(crew).not.toContain('email');
		expect(crew).toContain('0777');
		expect(crew).toContain('FOH');
		const owner = JSON.stringify([callSheet(db, e, { includePrivate: true }), listEventPeople(db, e, { includePrivate: true })]);
		expect(owner).toContain('peanut-allergy-secret');
		expect(owner).toContain('ann-secret@x.dev');
	});
});

describe('ownership and eligibility checks', () => {
	it('assignment and guest link lookups reject ids from another event', () => {
		const db = createTestDb();
		const e1 = ev(db, 'One');
		const e2 = ev(db, 'Two');
		const a1 = assign(db, e1, person(db, 'Ann'), { eventRole: '' });
		const a2 = assign(db, e2, person(db, 'Bob'), { eventRole: '' });
		expect(assignmentInEvent(db, e1, a1)?.id).toBe(a1);
		expect(assignmentInEvent(db, e1, a2)).toBeUndefined();
		expect(assignmentInEvent(db, e1, 9999)).toBeUndefined();
		const r = createLinkFor(db, e2, a2, { liveAccess: false, contactPersonId: null });
		expect(r.ok).toBe(true);
		const linkId = listGuestLinks(db, e2)[0].id;
		expect(guestLinkInEvent(db, e2, linkId)?.id).toBe(linkId);
		expect(guestLinkInEvent(db, e1, linkId)).toBeUndefined();
		expect(guestLinkInEvent(db, e1, 9999)).toBeUndefined();
	});

	it('createLinkFor rejects a foreign assignment and a contact not assigned to the event', () => {
		const db = createTestDb();
		const e1 = ev(db, 'One');
		const e2 = ev(db, 'Two');
		const ann = person(db, 'Ann');
		const bob = person(db, 'Bob');
		const a1 = assign(db, e1, ann, { eventRole: '' });
		assign(db, e2, bob, { eventRole: '' });
		expect(contactEligible(db, e1, ann)).toBe(true);
		expect(contactEligible(db, e1, bob)).toBe(false);
		const bad = createLinkFor(db, e1, a1, { liveAccess: false, contactPersonId: bob });
		expect(bad.ok).toBe(false);
		const foreign = createLinkFor(db, e2, a1, { liveAccess: false, contactPersonId: null });
		expect(foreign.ok).toBe(false);
		expect(db.select().from(guestLinks).all()).toHaveLength(0);
		expect(createLinkFor(db, e1, a1, { liveAccess: true, contactPersonId: ann }).ok).toBe(true);
	});

	it('stores only the token hash and honours default and custom expiry', () => {
		const db = createTestDb();
		const e = ev(db);
		const a = assign(db, e, person(db, 'Ann'), { eventRole: '' });
		const r1 = createLinkFor(db, e, a, { liveAccess: false, contactPersonId: null });
		const custom = future();
		const r2 = createLinkFor(db, e, a, { liveAccess: true, contactPersonId: null, expiresAt: custom });
		if (!r1.ok || !r2.ok) throw new Error('link creation failed');
		const rows = db.select().from(guestLinks).all();
		expect(JSON.stringify(rows)).not.toContain(r1.token);
		expect(JSON.stringify(rows)).not.toContain(r2.token);
		expect(rows.map((r) => r.tokenHash)).toEqual([hashToken(r1.token), hashToken(r2.token)]);
		// default: end date 2026-12-03 + 7 days, 23:59 local
		expect(rows[0].expiresAt).toBe(new Date('2026-12-10T23:59:00').getTime());
		expect(rows[1].expiresAt).toBe(custom);
		expect(rows[1].liveAccess).toBe(true);
	});

	it('inviteEligibility: ok, no email, existing login, duplicate email, missing person', async () => {
		const db = createTestDb();
		const noEmail = person(db, 'NoMail');
		const ok = person(db, 'Ok', { email: 'ok@x.dev' });
		const dup = person(db, 'Dup', { email: 'Owner@X.dev' });
		const login = person(db, 'Login', { email: 'login@x.dev' });
		await createOwner(db, { name: 'Owner', email: 'owner@x.dev', password: 'a-long-test-password' });
		db.insert(users).values({ email: 'login@x.dev', name: 'L', passwordHash: 'x', role: 'crew', personId: login, createdAt: 0 }).run();
		expect(inviteEligibility(db, ok)).toEqual({ ok: true, email: 'ok@x.dev' });
		expect(inviteEligibility(db, noEmail)).toMatchObject({ ok: false, reason: expect.stringContaining('email') });
		expect(inviteEligibility(db, login)).toMatchObject({ ok: false, reason: expect.stringContaining('already has a login') });
		expect(inviteEligibility(db, dup)).toMatchObject({ ok: false, reason: expect.stringContaining('already exists') });
		expect(inviteEligibility(db, 9999)).toMatchObject({ ok: false });
		// the person flag the UI shows
		const e = ev(db);
		assign(db, e, login, { eventRole: '' });
		assign(db, e, ok, { eventRole: '' });
		const byName = Object.fromEntries(listEventPeople(db, e, { includePrivate: true }).map((p) => [p.name, p.hasLogin]));
		expect(byName).toEqual({ Login: true, Ok: false });
	});
});

describe('linking an orphaned crew login', () => {
	it('links an unlinked crew login with the same email (case-insensitive), once', () => {
		const db = createTestDb();
		const p = person(db, 'Pat', { email: 'Pat@X.dev' });
		const uid = db.insert(users).values({ email: 'pat@x.dev', name: 'Pat', passwordHash: 'x', role: 'crew', personId: null, createdAt: 0 }).returning({ id: users.id }).get().id;
		const el = inviteEligibility(db, p);
		expect(el).toMatchObject({ ok: true, linkUserId: uid });
		expect(linkLogin(db, p, uid)).toBe(true);
		expect(db.select().from(users).where(eq(users.id, uid)).get()!.personId).toBe(p);
		expect(inviteEligibility(db, p)).toMatchObject({ ok: false, reason: expect.stringContaining('already has a login') });
	});
	it('refuses a user linked to a different person, and never links owners', async () => {
		const db = createTestDb();
		const other = person(db, 'Other');
		const p = person(db, 'Pat', { email: 'pat@x.dev' });
		const q = person(db, 'Own', { email: 'own@x.dev' });
		const uid = db.insert(users).values({ email: 'pat@x.dev', name: 'Pat', passwordHash: 'x', role: 'crew', personId: other, createdAt: 0 }).returning({ id: users.id }).get().id;
		expect(inviteEligibility(db, p)).toMatchObject({ ok: false, reason: expect.stringContaining('already exists') });
		expect(linkLogin(db, p, uid)).toBe(false);
		await createOwner(db, { name: 'Owner', email: 'own@x.dev', password: 'a-long-test-password' });
		expect(inviteEligibility(db, q)).toMatchObject({ ok: false, reason: expect.stringContaining('already exists') });
		const ownerId = db.select().from(users).where(eq(users.role, 'owner')).get()!.id;
		expect(linkLogin(db, q, ownerId)).toBe(false);
	});
});

describe('deletePerson with references', () => {
	it('removes assignments and detaches users, invites and guest-link contacts', () => {
		const db = createTestDb();
		const e = ev(db);
		const victim = person(db, 'Victim', { email: 'v@x.dev' });
		const other = person(db, 'Other');
		assign(db, e, victim, { eventRole: 'X' });
		const otherA = assign(db, e, other, { eventRole: 'Y' });
		const userId = db.insert(users).values({ email: 'v@x.dev', name: 'V', passwordHash: 'x', role: 'crew', personId: victim, createdAt: 0 }).returning({ id: users.id }).get().id;
		createInvite(db, { email: 'v2@x.dev', personId: victim }, Date.now());
		const r = createLinkFor(db, e, otherA, { liveAccess: false, contactPersonId: victim });
		expect(r.ok).toBe(true);

		deletePerson(db, victim);

		expect(getPerson(db, victim)).toBeUndefined();
		expect(db.select().from(assignments).where(eq(assignments.personId, victim)).all()).toHaveLength(0);
		expect(db.select().from(assignments).all()).toHaveLength(1);
		expect(db.select().from(users).where(eq(users.id, userId)).get()?.personId).toBeNull();
		expect(db.select().from(invites).all().every((i) => i.personId === null)).toBe(true);
		const link = db.select().from(guestLinks).get()!;
		expect(link.contactPersonId).toBeNull();
	});
});
