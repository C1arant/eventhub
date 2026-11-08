import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from './db';
import { assignmentDayCalls, assignments, eventDays, events, guestLinks, invites, people, users } from './db/schema';
import { indexDoc, removeDoc } from './search';


/** Comma-separated input -> trimmed, lowercased, de-duplicated tags. */
export function parseTags(raw: string): string[] {
	const out: string[] = [];
	for (const t of raw.split(',')) {
		const tag = t.trim().toLowerCase();
		if (tag && !out.includes(tag)) out.push(tag);
	}
	return out;
}

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/** HH:MM or blank (null). */
export const callTimeField = z.preprocess(
	blankToNull,
	z.string().trim().regex(timeRe, 'Use a time like 18:30').nullable()
);

export const personInput = z.object({
	name: z.string().trim().min(1, 'Name is required').max(200),
	phone: z.string().trim().max(50).default(''),
	email: z.union([z.literal(''), z.email('Enter a valid email address').max(200)]).default(''),
	notes: z.string().max(10_000).default(''),
	needs: z.string().max(2_000).default(''),
	tags: z.string().max(1_000).default('').transform(parseTags)
});
export type PersonInput = z.infer<typeof personInput>;

export type Person = Omit<typeof people.$inferSelect, 'tags'> & { tags: string[] };

function toPerson(r: typeof people.$inferSelect): Person {
	let tags: string[] = [];
	try {
		const v = JSON.parse(r.tags);
		if (Array.isArray(v)) tags = v.filter((x): x is string => typeof x === 'string');
	} catch {
		/* corrupt tags column: treat as none */
	}
	return { ...r, tags };
}

function reindex(db: DB, id: number, p: PersonInput) {
	indexDoc(db, 'person', id, null, [p.name, p.email, p.phone, p.notes, p.needs, p.tags.join(' ')].filter(Boolean).join(' '));
}

export function createPerson(db: DB, input: PersonInput): number {
	const row = db
		.insert(people)
		.values({ ...input, tags: JSON.stringify(input.tags) })
		.returning({ id: people.id })
		.get();
	reindex(db, row.id, input);
	return row.id;
}

export function updatePerson(db: DB, id: number, input: PersonInput): void {
	db.update(people).set({ ...input, tags: JSON.stringify(input.tags) }).where(eq(people.id, id)).run();
	reindex(db, id, input);
}

export function deletePerson(db: DB, id: number): void {
	// users.person_id and invites.person_id have no cascade: detach first so the delete cannot fail.
	db.transaction((tx) => {
		tx.update(users).set({ personId: null }).where(eq(users.personId, id)).run();
		tx.update(invites).set({ personId: null }).where(eq(invites.personId, id)).run();
		tx.update(guestLinks).set({ contactPersonId: null }).where(eq(guestLinks.contactPersonId, id)).run();
		tx.delete(people).where(eq(people.id, id)).run();
	});
	removeDoc(db, 'person', id);
}

export function listPeople(db: DB, f: { tag?: string; q?: string }): Person[] {
	const tag = f.tag?.trim().toLowerCase();
	const q = f.q?.trim().toLowerCase();
	return db
		.select()
		.from(people)
		.orderBy(asc(people.name))
		.all()
		.map(toPerson)
		.filter((p) => !tag || p.tags.includes(tag))
		.filter((p) => !q || [p.name, p.email, p.phone].some((s) => s.toLowerCase().includes(q)));
}

export type HistoryRow = { eventId: number; eventName: string; startDate: string; eventRole: string };

export function getPerson(db: DB, id: number): (Person & { history: HistoryRow[] }) | undefined {
	const r = db.select().from(people).where(eq(people.id, id)).get();
	if (!r) return undefined;
	const history = db
		.select({ eventId: events.id, eventName: events.name, startDate: events.startDate, eventRole: assignments.eventRole })
		.from(assignments)
		.innerJoin(events, eq(events.id, assignments.eventId))
		.where(eq(assignments.personId, id))
		.all()
		.sort((a, b) => b.startDate.localeCompare(a.startDate) || b.eventId - a.eventId);
	return { ...toPerson(r), history };
}

export type AssignInput = { eventRole: string; callTime?: string | null; isShowCaller?: boolean };

/** Throws if the person is already assigned to the event (unique constraint). */
export function assign(db: DB, eventId: number, personId: number, i: AssignInput): number {
	return db
		.insert(assignments)
		.values({ eventId, personId, eventRole: i.eventRole, callTime: i.callTime ?? null, isShowCaller: i.isShowCaller ?? false })
		.returning({ id: assignments.id })
		.get().id;
}

export function updateAssignment(db: DB, id: number, i: AssignInput): void {
	db.update(assignments)
		.set({ eventRole: i.eventRole, callTime: i.callTime ?? null, isShowCaller: i.isShowCaller ?? false })
		.where(eq(assignments.id, id))
		.run();
}

/** Removing the assignment cascades to day calls and guest links, so their links stop resolving. */
export function unassign(db: DB, assignmentId: number): void {
	db.delete(assignments).where(eq(assignments.id, assignmentId)).run();
}

/** Set (or with null, clear) one day's call time for an assignment. */
export function setDayCallTime(db: DB, assignmentId: number, dayId: number, callTime: string | null): void {
	db.transaction((tx) => {
		tx.delete(assignmentDayCalls)
			.where(and(eq(assignmentDayCalls.assignmentId, assignmentId), eq(assignmentDayCalls.dayId, dayId)))
			.run();
		if (callTime) tx.insert(assignmentDayCalls).values({ assignmentId, dayId, callTime }).run();
	});
}

export function getAssignment(db: DB, id: number) {
	return db.select().from(assignments).where(eq(assignments.id, id)).get();
}

export type EventPerson = {
	assignmentId: number;
	personId: number;
	name: string;
	email: string;
	phone: string;
	needs: string;
	eventRole: string;
	callTime: string | null;
	isShowCaller: boolean;
	hasLogin: boolean;
	dayCalls: { dayId: number; dayLabel: string; callTime: string }[];
};

export function listEventPeople(db: DB, eventId: number): EventPerson[] {
	const rows = db
		.select({
			assignmentId: assignments.id,
			personId: people.id,
			name: people.name,
			email: people.email,
			phone: people.phone,
			needs: people.needs,
			eventRole: assignments.eventRole,
			callTime: assignments.callTime,
			isShowCaller: assignments.isShowCaller
		})
		.from(assignments)
		.innerJoin(people, eq(people.id, assignments.personId))
		.where(eq(assignments.eventId, eventId))
		.orderBy(asc(people.name))
		.all();
	const calls = db
		.select({
			assignmentId: assignmentDayCalls.assignmentId,
			dayId: eventDays.id,
			dayLabel: eventDays.label,
			callTime: assignmentDayCalls.callTime
		})
		.from(assignmentDayCalls)
		.innerJoin(eventDays, eq(eventDays.id, assignmentDayCalls.dayId))
		.innerJoin(assignments, eq(assignments.id, assignmentDayCalls.assignmentId))
		.where(eq(assignments.eventId, eventId))
		.orderBy(asc(eventDays.position), asc(eventDays.date))
		.all();
	const withLogin = new Set(db.select({ personId: users.personId }).from(users).all().map((u) => u.personId));
	return rows.map((r) => ({
		...r,
		hasLogin: withLogin.has(r.personId),
		dayCalls: calls.filter((c) => c.assignmentId === r.assignmentId).map((c) => ({ dayId: c.dayId, dayLabel: c.dayLabel, callTime: c.callTime }))
	}));
}

export type CallSheetRow = {
	name: string;
	eventRole: string;
	phone: string;
	callTime: string | null;
	dayCalls: { dayLabel: string; callTime: string }[];
	needs: string;
};

/** Sorted by call time (unset last), then name. */
export function callSheet(db: DB, eventId: number): CallSheetRow[] {
	return listEventPeople(db, eventId)
		.map((p) => ({
			name: p.name,
			eventRole: p.eventRole,
			phone: p.phone,
			callTime: p.callTime,
			dayCalls: p.dayCalls.map((d) => ({ dayLabel: d.dayLabel, callTime: d.callTime })),
			needs: p.needs
		}))
		.sort((a, b) => {
			if (a.callTime !== b.callTime) {
				if (a.callTime === null) return 1;
				if (b.callTime === null) return -1;
				return a.callTime.localeCompare(b.callTime);
			}
			return a.name.localeCompare(b.name);
		});
}

export type GuestLinkRow = {
	id: number;
	assignmentId: number;
	personName: string;
	liveAccess: boolean;
	expiresAt: number;
	revokedAt: number | null;
	contactName: string | null;
};

export function listGuestLinks(db: DB, eventId: number): GuestLinkRow[] {
	const rows = db
		.select({
			id: guestLinks.id,
			assignmentId: guestLinks.assignmentId,
			personName: people.name,
			liveAccess: guestLinks.liveAccess,
			expiresAt: guestLinks.expiresAt,
			revokedAt: guestLinks.revokedAt,
			contactPersonId: guestLinks.contactPersonId
		})
		.from(guestLinks)
		.innerJoin(assignments, eq(assignments.id, guestLinks.assignmentId))
		.innerJoin(people, eq(people.id, assignments.personId))
		.where(eq(assignments.eventId, eventId))
		.orderBy(asc(guestLinks.id))
		.all();
	const names = new Map(db.select({ id: people.id, name: people.name }).from(people).all().map((p) => [p.id, p.name]));
	return rows.map(({ contactPersonId, ...r }) => ({
		...r,
		contactName: contactPersonId ? (names.get(contactPersonId) ?? null) : null
	}));
}

export function getGuestLink(db: DB, id: number) {
	return db
		.select({ id: guestLinks.id, eventId: assignments.eventId })
		.from(guestLinks)
		.innerJoin(assignments, eq(assignments.id, guestLinks.assignmentId))
		.where(eq(guestLinks.id, id))
		.get();
}

/** How many events a person is assigned to (for the delete warning). */
export function assignmentCount(db: DB, personId: number): number {
	return db.select({ id: assignments.id }).from(assignments).where(eq(assignments.personId, personId)).all().length;
}
