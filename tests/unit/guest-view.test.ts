import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../src/lib/server/db/test-db';
import {
	assignmentDayCalls, assignments, eventDays, events, files, guestLinks, people, rosItems
} from '../../src/lib/server/db/schema';
import { createGuestLink, resolveGuestToken } from '../../src/lib/server/auth/guests';
import { guestView, peopleNames } from '../../src/lib/server/guest-view';

function setup(liveAccess = true) {
	const db = createTestDb();
	const ev = db.insert(events).values({ name: 'Summer Fest', type: 'gig', startDate: '2099-06-01', endDate: '2099-06-02', venue: 'The Hall', address: '1 High St, Town', createdAt: 0 }).returning().get();
	const other = db.insert(events).values({ name: 'Other Event', type: 'gig', startDate: '2099-06-01', endDate: '2099-06-01', createdAt: 0 }).returning().get();
	const d1 = db.insert(eventDays).values({ eventId: ev.id, label: 'Friday', date: '2099-06-01', startTime: '18:00', position: 0 }).returning().get();
	const d2 = db.insert(eventDays).values({ eventId: ev.id, label: 'Saturday', date: '2099-06-02', startTime: '18:00', position: 1 }).returning().get();
	const mkP = (name: string, n: number) =>
		db.insert(people).values({ name, phone: `07000-PHONE-${n}`, email: `p${n}@secret.test`, needs: `NEEDS-${n}`, notes: `NOTES-${n}` }).returning().get();
	const guest = mkP('Sam', 1);
	const samantha = mkP('Samantha', 2);
	const contact = mkP('Casey Contact', 3);
	const rando = mkP('Rando', 4);
	const asg = (p: { id: number }, role: string, call: string | null = null) =>
		db.insert(assignments).values({ eventId: ev.id, personId: p.id, eventRole: role, callTime: call }).returning().get();
	const aGuest = asg(guest, 'Singer', '16:00');
	const aSam = asg(samantha, 'Dancer', '15:00');
	asg(contact, 'Manager');
	const aRando = asg(rando, 'Tech');
	db.insert(assignmentDayCalls).values({ assignmentId: aGuest.id, dayId: d2.id, callTime: '17:00' }).run();
	const item = (dayId: number, position: number, title: string, ppl: string) =>
		db.insert(rosItems).values({ dayId, position, title, durationSec: 600, people: ppl, notesSound: 'SECRET-SOUND', notesStage: 'SECRET-STAGE' }).run();
	item(d1.id, 0, 'Opener', 'Samantha, Rando');
	item(d1.id, 1, 'Sam Set', ' sam , Rando');
	item(d2.id, 0, 'Finale', 'SAM');
	item(d2.id, 1, 'Encore', 'Samantha');
	db.insert(files).values({ eventId: ev.id, assignmentId: aGuest.id, name: 'mine.pdf', mime: 'application/pdf', size: 1, storedName: 'u1', uploadedAt: 0 }).run();
	db.insert(files).values({ eventId: ev.id, assignmentId: aSam.id, name: 'samantha-secret.pdf', mime: 'application/pdf', size: 1, storedName: 'u2', uploadedAt: 0 }).run();
	db.insert(files).values({ eventId: ev.id, assignmentId: null, name: 'event-wide.pdf', mime: 'application/pdf', size: 1, storedName: 'u3', uploadedAt: 0 }).run();
	db.insert(files).values({ eventId: other.id, assignmentId: null, name: 'other-event.pdf', mime: 'application/pdf', size: 1, storedName: 'u4', uploadedAt: 0 }).run();
	const token = createGuestLink(db, aGuest.id, { liveAccess, contactPersonId: contact.id });
	const actor = resolveGuestToken(db, token, Date.now())!;
	return { db, ev, d1, d2, guest, samantha, contact, rando, aGuest, actor, token };
}

describe('guestView', () => {
	it('shows event info, own call times, contact and own files', () => {
		const { db, actor, contact, token, d2 } = setup();
		const v = guestView(db, actor, token);
		expect(v.eventName).toBe('Summer Fest');
		expect(v.venue).toBe('The Hall');
		expect(v.address).toBe('1 High St, Town');
		expect(v.days.map((d) => d.label)).toEqual(['Friday', 'Saturday']);
		expect(v.callTime).toBe('16:00');
		expect(v.dayCalls).toEqual([{ dayId: d2.id, dayLabel: 'Saturday', date: '2099-06-02', callTime: '17:00' }]);
		expect(v.contact).toEqual({ name: 'Casey Contact', phone: contact.phone });
		expect(v.files.map((f) => f.name)).toEqual(['mine.pdf']);
	});

	it('isolation: no other person phone/email/needs/notes, no department notes', () => {
		const { db, actor, contact, token } = setup();
		const s = JSON.stringify(guestView(db, actor, token));
		expect(s).toContain(contact.phone);
		for (const n of [2, 4]) {
			for (const k of [`07000-PHONE-${n}`, `p${n}@secret.test`, `NEEDS-${n}`, `NOTES-${n}`]) expect(s).not.toContain(k);
		}
		for (const k of ['p3@secret.test', 'NEEDS-3', 'NOTES-3', 'NEEDS-1', 'NOTES-1', 'p1@secret.test', '07000-PHONE-1']) expect(s).not.toContain(k);
		expect(s).not.toContain('SECRET-SOUND');
		expect(s).not.toContain('SECRET-STAGE');
		expect(s).not.toContain('Samantha');
		expect(s).not.toContain('Rando');
		expect(s).not.toContain('samantha-secret');
		expect(s).not.toContain('event-wide');
		expect(s).not.toContain('other-event');
	});

	it('mySlots match whole names case-insensitively; Sam does not match Samantha', () => {
		const { db, actor, token } = setup();
		const v = guestView(db, actor, token);
		expect(v.mySlots.map((s) => s.title)).toEqual(['Sam Set', 'Finale']);
		expect(Object.keys(v.mySlots[0]).sort()).toEqual(['clock', 'dayLabel', 'dayOffset', 'durationMin', 'title', 'type']);
		expect(v.mySlots[0].durationMin).toBe(10);
		expect(v.mySlots[0].dayLabel).toBe('Friday');
	});

	it('peopleNames splits on commas and trims', () => {
		expect(peopleNames(' Sam , Bo,, ')).toEqual(['sam', 'bo']);
	});

	it('liveDays is empty when liveAccess is false, else lists event day ids', () => {
		const off = setup(false);
		expect(guestView(off.db, off.actor, off.token).liveDays).toEqual([]);
		const on = setup(true);
		expect(guestView(on.db, on.actor, on.token).liveDays).toEqual([on.d1.id, on.d2.id]);
	});

	it('each link shows only its own contact; a link without one shows null', () => {
		const { db, actor, aGuest, contact, rando, token } = setup();
		const t2 = createGuestLink(db, aGuest.id, { liveAccess: true, contactPersonId: rando.id });
		const t3 = createGuestLink(db, aGuest.id, { liveAccess: true });
		expect(guestView(db, actor, token).contact?.name).toBe(contact.name);
		expect(guestView(db, actor, t2).contact?.name).toBe('Rando');
		expect(JSON.stringify(guestView(db, actor, t2))).not.toContain(contact.phone);
		expect(guestView(db, actor, t3).contact).toBeNull();
		expect(guestView(db, actor, 'not-a-link').contact).toBeNull();
	});

	it('no contact when none set; contact outside the event is not shown', () => {
		const { db, actor, contact, token } = setup();
		db.update(guestLinks).set({ contactPersonId: null }).run();
		expect(guestView(db, actor, token).contact).toBeNull();
		db.delete(assignments).where(eq(assignments.personId, contact.id)).run();
		db.update(guestLinks).set({ contactPersonId: contact.id }).run();
		expect(guestView(db, actor, token).contact).toBeNull();
	});
});
