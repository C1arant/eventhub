import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { GuestActor } from './auth/can';
import type { DB } from './db';
import { assignmentDayCalls, assignments, files, guestLinks, people } from './db/schema';
import { getEvent, listDays } from './events';
import { computeTimes, listItems } from './ros';
import { hashToken } from './util/tokens';

export type GuestSlot = { dayLabel: string; title: string; clock: string; dayOffset: number; durationMin: number; type: string };

export type GuestView = {
	eventName: string;
	venue: string;
	address: string;
	days: { id: number; label: string; date: string }[];
	callTime: string | null;
	dayCalls: { dayId: number; dayLabel: string; date: string; callTime: string }[];
	mySlots: GuestSlot[];
	contact: { name: string; phone: string } | null;
	files: { id: number; name: string }[];
	liveDays: number[];
};

/** Split a free-text people field into lowercase, trimmed, non-empty names. */
export function peopleNames(text: string): string[] {
	return text.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * Everything one guest may see. Built field by field: nothing is spread from a DB row,
 * so a new column can never leak by accident.
 */
export function guestView(db: DB, actor: GuestActor, token: string): GuestView {
	const ev = getEvent(db, actor.eventId);
	if (!ev) throw new Error('Event not found');
	const me = db.select({ name: people.name }).from(people).where(eq(people.id, actor.personId)).get();
	const myName = (me?.name ?? '').trim().toLowerCase();
	const asg = db.select({ callTime: assignments.callTime }).from(assignments).where(eq(assignments.id, actor.assignmentId)).get();
	const days = listDays(db, actor.eventId);

	const dayCalls = db
		.select({ dayId: assignmentDayCalls.dayId, callTime: assignmentDayCalls.callTime })
		.from(assignmentDayCalls)
		.where(eq(assignmentDayCalls.assignmentId, actor.assignmentId))
		.all()
		.flatMap((c) => {
			const d = days.find((x) => x.id === c.dayId);
			return d ? [{ dayId: d.id, dayLabel: d.label, date: d.date, callTime: c.callTime }] : [];
		})
		.sort((a, b) => a.date.localeCompare(b.date));

	const mySlots: GuestSlot[] = [];
	if (myName) {
		for (const d of days) {
			for (const it of computeTimes(d.startTime, listItems(db, d.id))) {
				if (!peopleNames(it.people).includes(myName)) continue;
				mySlots.push({ dayLabel: d.label, title: it.title, clock: it.clock, dayOffset: it.dayOffset, durationMin: Math.round(it.durationSec / 60), type: it.type });
			}
		}
	}

	// Only the link the guest arrived by decides the contact; sibling links never leak theirs.
	const linkRows = db
		.select({ contactPersonId: guestLinks.contactPersonId, tokenHash: guestLinks.tokenHash })
		.from(guestLinks)
		.where(and(eq(guestLinks.assignmentId, actor.assignmentId), isNull(guestLinks.revokedAt)))
		.orderBy(desc(guestLinks.id))
		.all();
	const link = linkRows.find((l) => l.tokenHash === hashToken(token));
	let contact: GuestView['contact'] = null;
	if (link?.contactPersonId) {
		// Only someone actually on this event can be shown.
		const c = db
			.select({ name: people.name, phone: people.phone })
			.from(assignments)
			.innerJoin(people, eq(people.id, assignments.personId))
			.where(and(eq(assignments.eventId, actor.eventId), eq(assignments.personId, link.contactPersonId)))
			.get();
		if (c) contact = { name: c.name, phone: c.phone };
	}

	const myFiles = db
		.select({ id: files.id, name: files.name })
		.from(files)
		.where(and(eq(files.eventId, actor.eventId), eq(files.assignmentId, actor.assignmentId)))
		.orderBy(asc(files.id))
		.all();

	return {
		eventName: ev.name,
		venue: ev.venue,
		address: ev.address,
		days: days.map((d) => ({ id: d.id, label: d.label, date: d.date })),
		callTime: asg?.callTime ?? null,
		dayCalls,
		mySlots,
		contact,
		files: myFiles,
		liveDays: actor.liveAccess ? days.map((d) => d.id) : []
	};
}
