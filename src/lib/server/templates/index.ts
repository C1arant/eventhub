import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { eventDays, templates } from '../db/schema';
import { addDay, createEvent, getEvent, listDays } from '../events';
import { addItem, listItems, rosItemInput, type RosItemInput } from '../ros';
import { addSection, addTask, listTasksBySection, taskInput } from '../tasks';
import { addDays, diffDays, isValidDate } from '../util/dates';
import { EVENT_TYPES } from '../../event-meta';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const templateData = z.object({
	/** Calendar days from start date to end date of the source event. */
	spanDays: z.number().int().min(0).max(3650).default(0),
	days: z.array(
		z.object({
			label: z.string().min(1).max(100),
			offsetDays: z.number().int(),
			startTime: time,
			items: z.array(rosItemInput)
		})
	),
	sections: z.array(
		z.object({
			name: z.string().min(1).max(200),
			tasks: z.array(
				z.object({
					title: z.string().min(1).max(300),
					priority: z.enum(['low', 'normal', 'high']),
					notes: z.string(),
					dueOffsetDays: z.number().int().nullable()
				})
			)
		})
	)
});
export type TemplateData = {
	spanDays: number;
	days: { label: string; offsetDays: number; startTime: string; items: RosItemInput[] }[];
	sections: { name: string; tasks: { title: string; priority: 'low' | 'normal' | 'high'; notes: string; dueOffsetDays: number | null }[] }[];
};

/** Raised for a missing or unreadable template; the message is safe to show to the user. */
export class TemplateError extends Error {}

export type TemplateSummary = { id: number; name: string; type: string; createdAt: number; taskCount: number; dayCount: number } & { broken: boolean };

function parseData(raw: string): TemplateData | null {
	try {
		const r = templateData.safeParse(JSON.parse(raw));
		return r.success ? (r.data as TemplateData) : null;
	} catch {
		return null;
	}
}

export function insertTemplate(db: DB, name: string, type: string, data: TemplateData): number {
	return db.insert(templates).values({ name, type, data: JSON.stringify(data), createdAt: Date.now() }).returning({ id: templates.id }).get().id;
}

export function saveAsTemplate(db: DB, eventId: number, name: string): number {
	const ev = getEvent(db, eventId);
	if (!ev) throw new TemplateError('Event not found');
	const data: TemplateData = {
		spanDays: diffDays(ev.startDate, ev.endDate),
		days: listDays(db, eventId).map((d) => ({
			label: d.label,
			offsetDays: diffDays(ev.startDate, d.date),
			startTime: d.startTime,
			items: listItems(db, d.id).map((i) =>
				rosItemInput.parse({
					title: i.title,
					durationMin: i.durationSec / 60,
					type: i.type,
					hardStart: i.hardStart,
					people: i.people,
					notesSound: i.notesSound,
					notesLighting: i.notesLighting,
					notesVideo: i.notesVideo,
					notesStage: i.notesStage
				})
			)
		})),
		sections: listTasksBySection(db, eventId).map(({ section, tasks }) => ({
			name: section.name,
			tasks: tasks.map((t) => ({
				title: t.title,
				priority: t.priority as 'low' | 'normal' | 'high',
				notes: t.notes,
				dueOffsetDays: t.dueDate ? diffDays(ev.startDate, t.dueDate) : null
			}))
		}))
	};
	return insertTemplate(db, name.trim() || ev.name, ev.type, data);
}

export function getTemplate(db: DB, id: number) {
	if (!Number.isInteger(id) || id < 1) return undefined;
	return db.select().from(templates).where(eq(templates.id, id)).get();
}

export function listTemplates(db: DB): TemplateSummary[] {
	return db.select().from(templates).orderBy(desc(templates.createdAt), desc(templates.id)).all().map((t) => {
		const d = parseData(t.data);
		return {
			id: t.id,
			name: t.name,
			type: t.type,
			createdAt: t.createdAt,
			taskCount: d ? d.sections.reduce((n, s) => n + s.tasks.length, 0) : 0,
			dayCount: d ? d.days.length : 0,
			broken: d === null
		};
	});
}

export function deleteTemplate(db: DB, id: number): void {
	db.delete(templates).where(eq(templates.id, id)).run();
}

export const instantiateInput = z.object({
	templateId: z.coerce.number().int().positive(),
	name: z.string().trim().min(1, 'Name is required').max(200),
	startDate: z.string().refine(isValidDate, 'Use a valid date')
});

/** Create a new event from a template, in one transaction. People, files and assignments are never copied. */
export function instantiateTemplate(db: DB, templateId: number, input: { name: string; startDate: string }): number {
	const t = getTemplate(db, templateId);
	if (!t) throw new TemplateError('That template no longer exists');
	const data = parseData(t.data);
	if (!data || !(EVENT_TYPES as readonly string[]).includes(t.type)) {
		throw new TemplateError('That template is damaged and cannot be used. Delete it and save a new one.');
	}
	return db.transaction(() => {
		const eventId = createEvent(db, {
			name: input.name,
			type: t.type as (typeof EVENT_TYPES)[number],
			startDate: input.startDate,
			endDate: addDays(input.startDate, data.spanDays),
			venue: '',
			address: '',
			status: 'idea',
			notes: ''
		});
		if (data.days.length > 0) {
			// Replace the default "Show" day created by createEvent.
			db.delete(eventDays).where(eq(eventDays.eventId, eventId)).run();
			for (const d of data.days) {
				const dayId = addDay(db, eventId, { label: d.label, date: addDays(input.startDate, d.offsetDays), startTime: d.startTime });
				for (const it of d.items) addItem(db, dayId, it);
			}
		}
		for (const s of data.sections) {
			const sid = addSection(db, eventId, s.name);
			for (const task of s.tasks) {
				addTask(db, eventId, sid, taskInput.parse({
					title: task.title,
					priority: task.priority,
					notes: task.notes,
					dueDate: task.dueOffsetDays === null ? null : addDays(input.startDate, task.dueOffsetDays)
				}));
			}
		}
		return eventId;
	});
}
