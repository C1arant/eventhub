import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from './db';
import { assignments, events, taskSections, tasks, users } from './db/schema';
import { indexDoc, removeDoc } from './search';
import { isValidDate } from './util/dates';

export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const;
export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

const blankToNull = (v: unknown) => (v === '' || v === undefined ? null : v);

export const taskInput = z.object({
	title: z.string().trim().min(1, 'Title is required').max(300),
	ownerUserId: z.preprocess(blankToNull, z.coerce.number().int().positive().nullable()).default(null),
	dueDate: z.preprocess(blankToNull, z.string().refine(isValidDate, 'Use a valid date').nullable()).default(null),
	/** Days before the event's start; when set, dueDate follows the event if it is rescheduled. */
	dueOffsetDays: z.preprocess(blankToNull, z.coerce.number().int().min(0, 'Use 0 or more days').max(3650).nullable()).default(null),
	priority: z.enum(TASK_PRIORITIES).default('normal'),
	status: z.enum(TASK_STATUSES).default('todo'),
	notes: z.string().max(10_000).default('')
});
export type TaskInput = z.infer<typeof taskInput>;

export type TaskRow = {
	id: number;
	eventId: number;
	eventName: string;
	sectionId: number;
	title: string;
	ownerUserId: number | null;
	ownerName: string | null;
	dueDate: string | null;
	dueOffsetDays: number | null;
	priority: string;
	status: string;
	notes: string;
};

export type Section = typeof taskSections.$inferSelect;

const taskCols = {
	id: tasks.id,
	eventId: tasks.eventId,
	eventName: events.name,
	sectionId: tasks.sectionId,
	title: tasks.title,
	ownerUserId: tasks.ownerUserId,
	ownerName: users.name,
	dueDate: tasks.dueDate,
	dueOffsetDays: tasks.dueOffsetDays,
	priority: tasks.priority,
	status: tasks.status,
	notes: tasks.notes
};

// ---- sections ----
export function getSection(db: DB, id: number) {
	return db.select().from(taskSections).where(eq(taskSections.id, id)).get();
}

export function addSection(db: DB, eventId: number, name: string): number {
	const pos = db.select({ m: sql<number>`coalesce(max(${taskSections.position}), -1)` }).from(taskSections).where(eq(taskSections.eventId, eventId)).get()!.m;
	return db.insert(taskSections).values({ eventId, name, position: pos + 1 }).returning({ id: taskSections.id }).get().id;
}

export function renameSection(db: DB, id: number, name: string): void {
	db.update(taskSections).set({ name }).where(eq(taskSections.id, id)).run();
}

/** Index of a section in its event's ordered list (0-based). */
export function sectionIndex(db: DB, id: number): number {
	const s = getSection(db, id);
	if (!s) return -1;
	return db.select({ id: taskSections.id }).from(taskSections).where(eq(taskSections.eventId, s.eventId)).orderBy(asc(taskSections.position), asc(taskSections.id)).all().findIndex((r) => r.id === id);
}

/** Move a section to a 0-based position among its event's sections; the rest are renumbered. */
export function moveSection(db: DB, id: number, newPosition: number): void {
	const s = getSection(db, id);
	if (!s) return;
	db.transaction((tx) => {
		const order = tx.select({ id: taskSections.id }).from(taskSections)
			.where(and(eq(taskSections.eventId, s.eventId), ne(taskSections.id, id)))
			.orderBy(asc(taskSections.position), asc(taskSections.id)).all().map((r) => r.id);
		const at = Math.max(0, Math.min(newPosition, order.length));
		order.splice(at, 0, id);
		order.forEach((sid, i) => tx.update(taskSections).set({ position: i }).where(eq(taskSections.id, sid)).run());
	});
}

export function deleteSection(db: DB, id: number): void {
	const s = getSection(db, id);
	const ids = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.sectionId, id)).all();
	db.delete(taskSections).where(eq(taskSections.id, id)).run(); // tasks cascade
	for (const r of ids) removeDoc(db, 'task', r.id);
	if (s) {
		const rest = db.select({ id: taskSections.id }).from(taskSections).where(eq(taskSections.eventId, s.eventId)).orderBy(asc(taskSections.position), asc(taskSections.id)).all();
		rest.forEach((r, i) => db.update(taskSections).set({ position: i }).where(eq(taskSections.id, r.id)).run());
	}
}

// ---- tasks ----
export function getTask(db: DB, id: number) {
	return db.select({ id: tasks.id, eventId: tasks.eventId, sectionId: tasks.sectionId, ownerUserId: tasks.ownerUserId }).from(tasks).where(eq(tasks.id, id)).get();
}

function reindex(db: DB, id: number, eventId: number, i: Pick<TaskInput, 'title' | 'notes'>) {
	indexDoc(db, 'task', id, eventId, [i.title, i.notes].filter(Boolean).join(' '));
}

export function addTask(db: DB, eventId: number, sectionId: number, input: TaskInput): number {
	const pos = db.select({ m: sql<number>`coalesce(max(${tasks.position}), -1)` }).from(tasks).where(eq(tasks.sectionId, sectionId)).get()!.m;
	const id = db.insert(tasks).values({ ...input, eventId, sectionId, position: pos + 1 }).returning({ id: tasks.id }).get().id;
	reindex(db, id, eventId, input);
	return id;
}

export function updateTask(db: DB, id: number, input: TaskInput): void {
	const { status: _status, ...rest } = input; // editing never changes status
	db.update(tasks).set(rest).where(eq(tasks.id, id)).run();
	const t = getTask(db, id);
	if (t) reindex(db, id, t.eventId, input);
}

export function setTaskStatus(db: DB, id: number, status: TaskStatus): void {
	db.update(tasks).set({ status }).where(eq(tasks.id, id)).run();
}

export function deleteTask(db: DB, id: number): void {
	db.delete(tasks).where(eq(tasks.id, id)).run();
	removeDoc(db, 'task', id);
}

const joined = (db: DB) => db.select(taskCols).from(tasks).innerJoin(events, eq(events.id, tasks.eventId)).leftJoin(users, eq(users.id, tasks.ownerUserId));

export function listTasksBySection(db: DB, eventId: number): { section: Section; tasks: TaskRow[] }[] {
	const sections = db.select().from(taskSections).where(eq(taskSections.eventId, eventId)).orderBy(asc(taskSections.position), asc(taskSections.id)).all();
	const rows = joined(db).where(eq(tasks.eventId, eventId)).orderBy(asc(tasks.position), asc(tasks.id)).all();
	return sections.map((section) => ({ section, tasks: rows.filter((r) => r.sectionId === section.id) }));
}

/**
 * Open tasks owned by the user; soonest due first (overdue naturally first), undated last.
 * Crew only see tasks on events they are still assigned to; owners see all they own.
 */
export function myTasks(db: DB, userId: number): TaskRow[] {
	const u = db.select({ role: users.role, personId: users.personId }).from(users).where(eq(users.id, userId)).get();
	if (!u) return [];
	if (u.role === 'crew' && u.personId === null) return [];
	const where = and(eq(tasks.ownerUserId, userId), ne(tasks.status, 'done'));
	const q = joined(db);
	const filtered =
		u.role === 'crew'
			? q.where(and(where, sql`exists (select 1 from ${assignments} where ${assignments.eventId} = ${tasks.eventId} and ${assignments.personId} = ${u.personId})`))
			: q.where(where);
	return filtered.orderBy(sql`${tasks.dueDate} is null`, asc(tasks.dueDate), asc(tasks.id)).all();
}

/** Users who can own a task on this event: assigned crew plus owner accounts. */
export function ownerCandidates(db: DB, eventId: number): { id: number; name: string }[] {
	const owners = db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, 'owner')).all();
	const crew = db.select({ id: users.id, name: users.name }).from(users)
		.innerJoin(assignments, and(eq(assignments.personId, users.personId), eq(assignments.eventId, eventId)))
		.where(eq(users.role, 'crew')).all();
	return [...owners, ...crew].sort((a, b) => a.name.localeCompare(b.name));
}
