import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../src/lib/server/db/test-db';
import { users } from '../../src/lib/server/db/schema';
import { createEvent, dashboard, eventInput } from '../../src/lib/server/events';
import {
	addSection, addTask, deleteSection, deleteTask, listTasksBySection, moveSection, myTasks,
	renameSection, setTaskStatus, taskInput, updateTask
} from '../../src/lib/server/tasks';

const ev = (db: ReturnType<typeof createTestDb>, name = 'Show') =>
	createEvent(db, eventInput.parse({ name, type: 'gig', startDate: '2026-03-10', endDate: '2026-03-10' }));
const mkUser = (db: ReturnType<typeof createTestDb>, email: string, name = email) =>
	db.insert(users).values({ email, name, passwordHash: 'x', role: 'owner', createdAt: 0 }).returning({ id: users.id }).get().id;
const t = (o: Record<string, unknown> = {}) => taskInput.parse({ title: 'Do it', ...o });

describe('tasks', () => {
	it('groups by section in position order', () => {
		const db = createTestDb();
		const e = ev(db);
		const a = addSection(db, e, 'A');
		const b = addSection(db, e, 'B');
		addTask(db, e, b, t({ title: 'b1' }));
		addTask(db, e, a, t({ title: 'a1' }));
		addTask(db, e, a, t({ title: 'a2' }));
		let g = listTasksBySection(db, e);
		expect(g.map((x) => x.section.name)).toEqual(['A', 'B']);
		expect(g[0].tasks.map((x) => x.title)).toEqual(['a1', 'a2']);
		moveSection(db, b, 0);
		g = listTasksBySection(db, e);
		expect(g.map((x) => x.section.name)).toEqual(['B', 'A']);
		renameSection(db, a, 'A2');
		expect(listTasksBySection(db, e)[1].section.name).toBe('A2');
	});

	it('setTaskStatus persists and update works', () => {
		const db = createTestDb();
		const e = ev(db);
		const s = addSection(db, e, 'S');
		const id = addTask(db, e, s, t());
		setTaskStatus(db, id, 'done');
		expect(listTasksBySection(db, e)[0].tasks[0].status).toBe('done');
		updateTask(db, id, t({ title: 'New', priority: 'high', dueDate: '2026-03-01' }));
		expect(listTasksBySection(db, e)[0].tasks[0]).toMatchObject({ title: 'New', priority: 'high', dueDate: '2026-03-01', eventName: 'Show' });
		deleteTask(db, id);
		expect(listTasksBySection(db, e)[0].tasks).toEqual([]);
	});

	it('myTasks excludes others and done, sorted by due date nulls last', () => {
		const db = createTestDb();
		const e = ev(db);
		const s = addSection(db, e, 'S');
		const me = mkUser(db, 'me@x.com', 'Me');
		const other = mkUser(db, 'o@x.com');
		addTask(db, e, s, t({ title: 'none', ownerUserId: me }));
		addTask(db, e, s, t({ title: 'late', ownerUserId: me, dueDate: '2026-05-01' }));
		addTask(db, e, s, t({ title: 'early', ownerUserId: me, dueDate: '2026-04-01' }));
		addTask(db, e, s, t({ title: 'theirs', ownerUserId: other, dueDate: '2026-04-01' }));
		const d = addTask(db, e, s, t({ title: 'done', ownerUserId: me, dueDate: '2026-04-01' }));
		setTaskStatus(db, d, 'done');
		const r = myTasks(db, me);
		expect(r.map((x) => x.title)).toEqual(['early', 'late', 'none']);
		expect(r[0]).toMatchObject({ ownerName: 'Me', eventName: 'Show' });
	});

	it('deleting a section deletes its tasks', () => {
		const db = createTestDb();
		const e = ev(db);
		const s = addSection(db, e, 'S');
		const s2 = addSection(db, e, 'S2');
		addTask(db, e, s, t());
		addTask(db, e, s2, t({ title: 'keep' }));
		deleteSection(db, s);
		const g = listTasksBySection(db, e);
		expect(g).toHaveLength(1);
		expect(g[0].tasks.map((x) => x.title)).toEqual(['keep']);
	});

	it('validates due dates as real calendar dates', () => {
		expect(taskInput.safeParse({ title: 'x', dueDate: '2026-02-31' }).success).toBe(false);
		expect(taskInput.safeParse({ title: 'x', dueDate: '2026-02-28' }).success).toBe(true);
		expect(taskInput.parse({ title: 'x', dueDate: '' }).dueDate).toBeNull();
		expect(taskInput.parse({ title: 'x', ownerUserId: '' }).ownerUserId).toBeNull();
	});

	it('dashboard shows own open tasks due within 7 days, overdue first', () => {
		const db = createTestDb();
		const e = ev(db);
		const s = addSection(db, e, 'S');
		const me = mkUser(db, 'me@x.com');
		addTask(db, e, s, t({ title: 'soon', ownerUserId: me, dueDate: '2026-03-15' }));
		addTask(db, e, s, t({ title: 'overdue', ownerUserId: me, dueDate: '2026-03-01' }));
		addTask(db, e, s, t({ title: 'far', ownerUserId: me, dueDate: '2026-03-30' }));
		addTask(db, e, s, t({ title: 'nodate', ownerUserId: me }));
		const user = { id: me, email: 'me@x.com', name: 'me', role: 'owner' as const, personId: null };
		const d = dashboard(db, { kind: 'owner', user }, '2026-03-10');
		expect(d.myTasks.map((x) => x.title)).toEqual(['overdue', 'soon']);
	});
});
