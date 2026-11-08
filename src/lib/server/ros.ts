import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from './db';
import { eventDays, rosItems } from './db/schema';
import { minToClock, timeToMin } from './util/dates';

export const ROS_TYPES = ['act', 'changeover', 'break', 'speech', 'match', 'ad_read', 'donation_push', 'other'] as const;
export const DEPARTMENTS = ['sound', 'lighting', 'video', 'stage'] as const;
export type Department = (typeof DEPARTMENTS)[number];

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const rosItemInput = z.object({
	title: z.string().trim().min(1, 'Title is required').max(300),
	/** Duration in whole minutes (1..1440) as entered in the UI; stored as seconds. */
	durationMin: z.coerce.number({ error: 'Enter a duration in minutes' }).int('Whole minutes only').min(1, 'At least 1 minute').max(1440, 'At most 1440 minutes'),
	type: z.enum(ROS_TYPES).default('act'),
	hardStart: z.preprocess(blankToNull, z.string().trim().regex(timeRe, 'Use a time like 18:30').nullable()).default(null),
	people: z.string().trim().max(1_000).default(''),
	notesSound: z.string().max(5_000).default(''),
	notesLighting: z.string().max(5_000).default(''),
	notesVideo: z.string().max(5_000).default(''),
	notesStage: z.string().max(5_000).default('')
});
export type RosItemInput = z.infer<typeof rosItemInput>;
export type RosItem = typeof rosItems.$inferSelect;
export type TimedItem = RosItem & { startMin: number; endMin: number; clock: string; dayOffset: number; conflict: boolean };

export function getItem(db: DB, id: number) {
	return db.select().from(rosItems).where(eq(rosItems.id, id)).get();
}

export function getDay(db: DB, id: number) {
	return db.select().from(eventDays).where(eq(eventDays.id, id)).get();
}

/** The item if (and only if) it belongs to a day of this event. */
export function itemInEvent(db: DB, eventId: number, itemId: number) {
	if (!Number.isInteger(itemId) || itemId < 1) return undefined;
	const row = db
		.select({ item: rosItems })
		.from(rosItems)
		.innerJoin(eventDays, eq(rosItems.dayId, eventDays.id))
		.where(and(eq(rosItems.id, itemId), eq(eventDays.eventId, eventId)))
		.get();
	return row?.item;
}

/** The day if (and only if) it belongs to this event. */
export function dayInEvent(db: DB, eventId: number, dayId: number) {
	if (!Number.isInteger(dayId) || dayId < 1) return undefined;
	const d = getDay(db, dayId);
	return d && d.eventId === eventId ? d : undefined;
}

export function listItems(db: DB, dayId: number): RosItem[] {
	return db.select().from(rosItems).where(eq(rosItems.dayId, dayId)).orderBy(asc(rosItems.position), asc(rosItems.id)).all();
}

export function itemIndex(db: DB, itemId: number): number {
	const it = getItem(db, itemId);
	return it ? listItems(db, it.dayId).findIndex((x) => x.id === itemId) : -1;
}

function values(input: RosItemInput) {
	const { durationMin, ...rest } = input;
	return { ...rest, durationSec: durationMin * 60 };
}

export function addItem(db: DB, dayId: number, input: RosItemInput): number {
	const pos = db.select({ m: sql<number>`coalesce(max(${rosItems.position}), -1)` }).from(rosItems).where(eq(rosItems.dayId, dayId)).get()!.m;
	return db.insert(rosItems).values({ dayId, position: pos + 1, ...values(input) }).returning({ id: rosItems.id }).get().id;
}

export function updateItem(db: DB, id: number, input: RosItemInput): void {
	db.update(rosItems).set(values(input)).where(eq(rosItems.id, id)).run();
}

/** Move to a 0-based index among the day's items; positions are renumbered 0..n-1 in one transaction. */
export function moveItem(db: DB, itemId: number, newPosition: number): void {
	const it = getItem(db, itemId);
	if (!it) return;
	db.transaction((tx) => {
		const order = tx.select({ id: rosItems.id }).from(rosItems).where(eq(rosItems.dayId, it.dayId))
			.orderBy(asc(rosItems.position), asc(rosItems.id)).all().map((r) => r.id).filter((i) => i !== itemId);
		const at = Math.max(0, Math.min(newPosition, order.length));
		order.splice(at, 0, itemId);
		order.forEach((iid, i) => tx.update(rosItems).set({ position: i }).where(eq(rosItems.id, iid)).run());
	});
}

/** Set a day's whole order from a list of ids (must be exactly the day's items). Returns false if it does not match. */
export function reorderItems(db: DB, dayId: number, ids: number[]): boolean {
	const current = listItems(db, dayId).map((i) => i.id);
	if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((i) => current.includes(i))) return false;
	db.transaction((tx) => ids.forEach((iid, i) => tx.update(rosItems).set({ position: i }).where(eq(rosItems.id, iid)).run()));
	return true;
}

/** Delete an item and close the gap in positions. Returns the deleted row's { dayId }, or null if it did not exist. */
export function deleteItem(db: DB, itemId: number): { dayId: number } | null {
	const it = getItem(db, itemId);
	if (!it) return null;
	db.transaction((tx) => {
		tx.delete(rosItems).where(eq(rosItems.id, itemId)).run();
		const rest = tx.select({ id: rosItems.id }).from(rosItems).where(eq(rosItems.dayId, it.dayId)).orderBy(asc(rosItems.position), asc(rosItems.id)).all();
		rest.forEach((r, i) => tx.update(rosItems).set({ position: i }).where(eq(rosItems.id, r.id)).run());
	});
	return { dayId: it.dayId };
}

export function computeTimes(dayStartTime: string, items: RosItem[]): TimedItem[] {
	let cursor = timeToMin(dayStartTime);
	return items.map((item) => {
		let start = cursor;
		let conflict = false;
		if (item.hardStart) {
			let h = timeToMin(item.hardStart);
			while (h < cursor - 720) h += 1440;
			conflict = h < cursor;
			start = h;
		}
		const end = start + item.durationSec / 60;
		cursor = end;
		const { clock, dayOffset } = minToClock(start);
		return { ...item, startMin: start, endMin: end, clock, dayOffset, conflict };
	});
}
