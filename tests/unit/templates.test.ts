import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../src/lib/server/db/test-db';
import { addDay, createEvent, eventInput, getEvent, listDays } from '../../src/lib/server/events';
import { addSection, addTask, listTasksBySection, taskInput } from '../../src/lib/server/tasks';
import { addItem, listItems, rosItemInput } from '../../src/lib/server/ros';
import { assignments, people, templates } from '../../src/lib/server/db/schema';
import { EVENT_TYPES } from '../../src/lib/event-meta';
import {
	TemplateError, deleteTemplate, instantiateTemplate, listTemplates, saveAsTemplate
} from '../../src/lib/server/templates';
import { STARTERS, seedStarters } from '../../src/lib/server/templates/starters';

function source(db: ReturnType<typeof createTestDb>) {
	const id = createEvent(db, eventInput.parse({ name: 'Autumn Gig', type: 'gig', startDate: '2026-10-25', endDate: '2026-10-26' }));
	const day0 = listDays(db, id)[0];
	addItem(db, day0.id, rosItemInput.parse({ title: 'Doors', durationMin: 30, type: 'other', hardStart: '19:00' }));
	addItem(db, day0.id, rosItemInput.parse({ title: 'Headliner', durationMin: 60, type: 'act', people: 'Band', notesSound: 'IEMs' }));
	addDay(db, id, { label: 'Day 2', date: '2026-10-26', startTime: '12:00' });
	const sec = addSection(db, id, 'Before');
	addTask(db, id, sec, taskInput.parse({ title: 'Book van', dueDate: '2026-10-22', priority: 'high', notes: 'n' }));
	addTask(db, id, sec, taskInput.parse({ title: 'No date' }));
	return id;
}

describe('templates', () => {
	it('shifts a task due 3 days before across the UK DST change (Review Focus 2)', () => {
		const db = createTestDb();
		const tid = saveAsTemplate(db, source(db), 'T');
		const id = instantiateTemplate(db, tid, { name: 'Next', startDate: '2026-10-25' });
		const t = listTasksBySection(db, id)[0].tasks;
		expect(t.find((x) => x.title === 'Book van')!.dueDate).toBe('2026-10-22');
		expect(t.find((x) => x.title === 'No date')!.dueDate).toBeNull();
		// and a different start shifts relative
		const id2 = instantiateTemplate(db, tid, { name: 'Later', startDate: '2027-03-30' });
		expect(listTasksBySection(db, id2)[0].tasks[0].dueDate).toBe('2027-03-27');
	});

	it('keeps day offsets, items, span, type; resets status/venue; no stray default day', () => {
		const db = createTestDb();
		const tid = saveAsTemplate(db, source(db), 'T');
		const id = instantiateTemplate(db, tid, { name: 'Next', startDate: '2027-01-10' });
		const ev = getEvent(db, id)!;
		expect(ev).toMatchObject({ type: 'gig', status: 'idea', venue: '', address: '', notes: '', startDate: '2027-01-10', endDate: '2027-01-11' });
		const days = listDays(db, id);
		expect(days.map((d) => [d.label, d.date, d.startTime])).toEqual([['Show', '2027-01-10', '19:00'], ['Day 2', '2027-01-11', '12:00']]);
		const items = listItems(db, days[0].id);
		expect(items.map((i) => i.title)).toEqual(['Doors', 'Headliner']);
		expect(items[0]).toMatchObject({ durationSec: 1800, hardStart: '19:00' });
		expect(items[1]).toMatchObject({ people: 'Band', notesSound: 'IEMs' });
	});

	it('does not copy people, assignments or files', () => {
		const db = createTestDb();
		const src = source(db);
		const p = db.insert(people).values({ name: 'Sam' } as never).returning({ id: people.id }).get().id;
		db.insert(assignments).values({ eventId: src, personId: p, eventRole: 'FOH' } as never).run();
		const id = instantiateTemplate(db, saveAsTemplate(db, src, 'T'), { name: 'N', startDate: '2027-01-10' });
		expect(db.select().from(assignments).where(eq(assignments.eventId, id)).all()).toHaveLength(0);
	});

	it('seedStarters is idempotent: 7 templates, one per type', () => {
		const db = createTestDb();
		seedStarters(db);
		seedStarters(db);
		const list = listTemplates(db);
		expect(list).toHaveLength(7);
		expect(new Set(list.map((t) => t.type))).toEqual(new Set(EVENT_TYPES));
	});

	it('does not reseed once the user has deleted starters but templates exist', () => {
		const db = createTestDb();
		seedStarters(db);
		const [first, ...rest] = listTemplates(db);
		for (const t of rest) deleteTemplate(db, t.id);
		seedStarters(db);
		expect(listTemplates(db).map((t) => t.id)).toEqual([first.id]);
	});

	it('starters: 6-12 tasks, mandated titles, valid, instantiate cleanly, club runs past midnight', () => {
		const db = createTestDb();
		seedStarters(db);
		expect(STARTERS).toHaveLength(7);
		for (const t of listTemplates(db)) {
			expect(t.broken).toBe(false);
			expect(t.taskCount).toBeGreaterThanOrEqual(6);
			expect(t.taskCount).toBeLessThanOrEqual(12);
			expect(t.dayCount).toBeGreaterThanOrEqual(1);
			const id = instantiateTemplate(db, t.id, { name: t.name, startDate: '2026-12-01' });
			const days = listDays(db, id);
			expect(days.length).toBe(t.dayCount);
			expect(listItems(db, days[0].id).length).toBeGreaterThan(2);
		}
		const titles = (type: string) => {
			const s = STARTERS.find((x) => x.type === type)!;
			return s.data.sections.flatMap((x) => x.tasks.map((y) => y.title));
		};
		expect(titles('charity_stream')).toEqual(expect.arrayContaining(['Test stream key', 'Donation page live', 'Overlay check', 'Schedule raid']));
		expect(titles('gig')).toEqual(expect.arrayContaining(['Advance venue', 'Confirm rider', 'Send set times', 'Guest list']));
		const club = STARTERS.find((x) => x.type === 'club')!.data.days[0];
		const total = club.items.reduce((n, i) => n + i.durationMin, 0);
		const [h, m] = club.startTime.split(':').map(Number);
		expect(h * 60 + m + total).toBeGreaterThan(1440);
	});

	it('a corrupt template gives a friendly TemplateError, not a crash', () => {
		const db = createTestDb();
		const row = db.insert(templates).values({ name: 'Bad', type: 'gig', data: '{not json', createdAt: 1 }).returning({ id: templates.id }).get();
		expect(() => instantiateTemplate(db, row.id, { name: 'x', startDate: '2026-01-01' })).toThrow(TemplateError);
		const row2 = db.insert(templates).values({ name: 'Bad2', type: 'gig', data: '{"days":"x"}', createdAt: 2 }).returning({ id: templates.id }).get();
		expect(() => instantiateTemplate(db, row2.id, { name: 'x', startDate: '2026-01-01' })).toThrow(TemplateError);
		expect(() => instantiateTemplate(db, 9999, { name: 'x', startDate: '2026-01-01' })).toThrow(TemplateError);
		expect(listTemplates(db).every((t) => t.broken)).toBe(true);
	});
});
