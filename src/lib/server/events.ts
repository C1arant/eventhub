import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from './db';
import { assignments, eventDays, events, tasks } from './db/schema';
import type { Actor } from './auth/can';
import { EVENT_STATUSES, EVENT_TYPES } from '../event-meta';
import { indexDoc, removeDoc } from './search';
import { addDays, isValidDate } from './util/dates';
import { myTasks, type TaskRow } from './tasks';


const date = z.string().refine(isValidDate, 'Use a valid date');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 19:00');

export const eventInput = z
	.object({
		name: z.string().trim().min(1, 'Name is required').max(200),
		type: z.enum(EVENT_TYPES, { error: 'Choose a type' }),
		startDate: date,
		endDate: date,
		venue: z.string().trim().max(200).default(''),
		address: z.string().trim().max(500).default(''),
		status: z.enum(EVENT_STATUSES).default('idea'),
		notes: z.string().max(10_000).default('')
	})
	.refine((v) => v.endDate >= v.startDate, {
		path: ['endDate'],
		message: 'End date cannot be before the start date'
	});
export type EventInput = z.infer<typeof eventInput>;

export const dayInput = z.object({
	label: z.string().trim().min(1, 'Label is required').max(100),
	date,
	startTime: time
});
export type DayInput = z.infer<typeof dayInput>;

export type EventSummary = {
	id: number;
	name: string;
	type: string;
	startDate: string;
	endDate: string;
	venue: string;
	status: string;
};

const summaryCols = {
	id: events.id,
	name: events.name,
	type: events.type,
	startDate: events.startDate,
	endDate: events.endDate,
	venue: events.venue,
	status: events.status
};

function reindex(db: DB, id: number, i: EventInput) {
	indexDoc(db, 'event', id, id, [i.name, i.venue, i.address, i.notes].filter(Boolean).join(' '));
}

export function createEvent(db: DB, input: EventInput): number {
	const id = db.transaction((tx) => {
		const row = tx.insert(events).values({ ...input, createdAt: Date.now() }).returning({ id: events.id }).get();
		tx.insert(eventDays)
			.values({ eventId: row.id, label: 'Show', date: input.startDate, startTime: '19:00', position: 0 })
			.run();
		return row.id;
	});
	reindex(db, id, input);
	return id;
}

export function updateEvent(db: DB, id: number, input: EventInput): void {
	db.transaction((tx) => {
		const old = tx.select({ startDate: events.startDate }).from(events).where(eq(events.id, id)).get();
		tx.update(events).set(input).where(eq(events.id, id)).run();
		// Relative due dates ("N days before") follow the event when it is rescheduled.
		if (old && old.startDate !== input.startDate) {
			const rel = tx.select({ id: tasks.id, off: tasks.dueOffsetDays }).from(tasks).where(and(eq(tasks.eventId, id), isNotNull(tasks.dueOffsetDays))).all();
			for (const t of rel) tx.update(tasks).set({ dueDate: addDays(input.startDate, -t.off!) }).where(eq(tasks.id, t.id)).run();
		}
	});
	reindex(db, id, input);
}

export function deleteEvent(db: DB, id: number): void {
	db.delete(events).where(eq(events.id, id)).run();
	removeDoc(db, 'event', id);
}

export function getEvent(db: DB, id: number) {
	return db.select().from(events).where(eq(events.id, id)).get();
}

function assignedEventIds(db: DB, personId: number): number[] {
	return db.select({ id: assignments.eventId }).from(assignments).where(eq(assignments.personId, personId)).all().map((r) => r.id);
}

/** Owner: all events. Crew: assigned events only. Others: none. */
export function listEventsFor(db: DB, actor: Actor): EventSummary[] {
	if (actor.kind === 'owner') {
		return db.select(summaryCols).from(events).orderBy(asc(events.startDate), asc(events.id)).all();
	}
	if (actor.kind === 'crew' && actor.user.personId !== null) {
		const ids = assignedEventIds(db, actor.user.personId);
		if (ids.length === 0) return [];
		return db.select(summaryCols).from(events).where(inArray(events.id, ids)).orderBy(asc(events.startDate), asc(events.id)).all();
	}
	return [];
}

export function listDays(db: DB, eventId: number) {
	return db.select().from(eventDays).where(eq(eventDays.eventId, eventId)).orderBy(asc(eventDays.date), asc(eventDays.position), asc(eventDays.id)).all();
}

export function addDay(db: DB, eventId: number, d: DayInput): number {
	const pos = db.select({ m: sql<number>`coalesce(max(${eventDays.position}), -1)` }).from(eventDays).where(eq(eventDays.eventId, eventId)).get()!.m;
	return db.insert(eventDays).values({ eventId, ...d, position: pos + 1 }).returning({ id: eventDays.id }).get().id;
}

export function updateDay(db: DB, id: number, d: DayInput): void {
	db.update(eventDays).set(d).where(eq(eventDays.id, id)).run();
}

export function getDay(db: DB, id: number) {
	return db.select().from(eventDays).where(eq(eventDays.id, id)).get();
}

export function deleteDay(db: DB, id: number): { ok: true } | { ok: false; error: string } {
	const day = getDay(db, id);
	if (!day) return { ok: false, error: 'Day not found' };
	const count = db.select({ n: sql<number>`count(*)` }).from(eventDays).where(eq(eventDays.eventId, day.eventId)).get()!.n;
	if (count <= 1) return { ok: false, error: 'An event needs at least one day, so the last one cannot be deleted' };
	db.delete(eventDays).where(eq(eventDays.id, id)).run();
	return { ok: true };
}

export function dashboard(db: DB, actor: Actor, today: string): { upcoming: EventSummary[]; myTasks: TaskRow[]; today: EventSummary[] } {
	const visible = listEventsFor(db, actor);
	return {
		today: visible.filter((e) => e.startDate <= today && e.endDate >= today),
		upcoming: visible.filter((e) => e.startDate > today).slice(0, 10),
		myTasks:
			actor.kind === 'owner' || actor.kind === 'crew'
				? myTasks(db, actor.user.id).filter((t) => t.dueDate !== null && t.dueDate <= addDays(today, 7))
				: []
	};
}
