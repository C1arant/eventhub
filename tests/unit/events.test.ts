import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../src/lib/server/db/test-db';
import { assignments, eventDays, people } from '../../src/lib/server/db/schema';
import type { Actor } from '../../src/lib/server/auth/can';
import {
	addDay, createEvent, dashboard, deleteDay, deleteEvent, eventInput, getEvent, listDays,
	listEventsFor, updateDay, updateEvent
} from '../../src/lib/server/events';
import { todayLocal } from '../../src/lib/server/util/dates';

const input = (o: Partial<Record<string, string>> = {}) =>
	eventInput.parse({ name: 'Show', type: 'gig', startDate: '2026-03-10', endDate: '2026-03-10', ...o });
const user = (role: 'owner' | 'crew', personId: number | null) => ({
	id: 1, email: 'a@b.com', name: 'A', role, personId
});

describe('events', () => {
	it('createEvent makes a default day', () => {
		const db = createTestDb();
		const id = createEvent(db, input({ startDate: '2026-03-10', endDate: '2026-03-12' }));
		const days = listDays(db, id);
		expect(days).toHaveLength(1);
		expect(days[0]).toMatchObject({ label: 'Show', date: '2026-03-10', startTime: '19:00' });
		expect(getEvent(db, id)?.status).toBe('idea');
	});

	it('rejects endDate before startDate', () => {
		const r = eventInput.safeParse({ name: 'x', type: 'gig', startDate: '2026-03-10', endDate: '2026-03-09' });
		expect(r.success).toBe(false);
		expect(eventInput.safeParse({ name: 'x', type: 'bogus', startDate: '2026-03-10', endDate: '2026-03-10' }).success).toBe(false);
	});

	it('crew see only assigned events; owner sees all', () => {
		const db = createTestDb();
		const a = createEvent(db, input({ name: 'A' }));
		createEvent(db, input({ name: 'B' }));
		const p = db.insert(people).values({ name: 'c' }).returning().get();
		db.insert(assignments).values({ eventId: a, personId: p.id }).run();
		const crew: Actor = { kind: 'crew', user: user('crew', p.id) };
		expect(listEventsFor(db, crew).map((e) => e.name)).toEqual(['A']);
		expect(listEventsFor(db, { kind: 'owner', user: user('owner', null) })).toHaveLength(2);
		expect(listEventsFor(db, { kind: 'anon' })).toEqual([]);
	});

	it('update works and delete cascades days', () => {
		const db = createTestDb();
		const id = createEvent(db, input());
		updateEvent(db, id, input({ name: 'Renamed', status: 'confirmed' }));
		expect(getEvent(db, id)).toMatchObject({ name: 'Renamed', status: 'confirmed' });
		addDay(db, id, { label: 'Day 2', date: '2026-03-11', startTime: '10:00' });
		deleteEvent(db, id);
		expect(getEvent(db, id)).toBeUndefined();
		expect(db.select().from(eventDays).all()).toHaveLength(0);
	});

	it('days: add, update, delete, last day protected', () => {
		const db = createTestDb();
		const id = createEvent(db, input());
		const d2 = addDay(db, id, { label: 'Two', date: '2026-03-11', startTime: '12:00' });
		updateDay(db, d2, { label: 'Second', date: '2026-03-12', startTime: '13:00' });
		expect(listDays(db, id).map((d) => d.label)).toEqual(['Show', 'Second']);
		expect(deleteDay(db, d2)).toEqual({ ok: true });
		const only = listDays(db, id)[0];
		const r = deleteDay(db, only.id);
		expect(r.ok).toBe(false);
		expect(listDays(db, id)).toHaveLength(1);
	});

	it('dashboard splits upcoming and today', () => {
		const db = createTestDb();
		createEvent(db, input({ name: 'Past', startDate: '2026-01-01', endDate: '2026-01-01' }));
		createEvent(db, input({ name: 'Now', startDate: '2026-03-09', endDate: '2026-03-11' }));
		createEvent(db, input({ name: 'Later', startDate: '2026-04-01', endDate: '2026-04-01' }));
		const d = dashboard(db, { kind: 'owner', user: user('owner', null) }, '2026-03-10');
		expect(d.today.map((e) => e.name)).toEqual(['Now']);
		expect(d.upcoming.map((e) => e.name)).toEqual(['Later']);
		expect(d.myTasks).toEqual([]);
	});

	it('todayLocal is YYYY-MM-DD', () => {
		expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

describe('eventInput dates', () => {
	it('rejects impossible calendar dates', () => {
		expect(eventInput.safeParse({ name: 'x', type: 'gig', startDate: '2026-02-31', endDate: '2026-03-01' }).success).toBe(false);
		expect(eventInput.safeParse({ name: 'x', type: 'gig', startDate: '2026-03-01', endDate: '2026-13-01' }).success).toBe(false);
	});
});
