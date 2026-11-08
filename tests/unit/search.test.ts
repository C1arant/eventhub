import { describe, expect, it } from 'vitest';
import type { Actor } from '../../src/lib/server/auth/can';
import { createTestDb } from '../../src/lib/server/db/test-db';
import { users } from '../../src/lib/server/db/schema';
import { createEvent, deleteEvent, eventInput, updateEvent } from '../../src/lib/server/events';
import { assign, createPerson, deletePerson, personInput } from '../../src/lib/server/people';
import { rebuildSearchIndex, sanitizeQuery, search } from '../../src/lib/server/search';
import { addSection, addTask, deleteTask, taskInput } from '../../src/lib/server/tasks';

type Db = ReturnType<typeof createTestDb>;
const ev = (db: Db, name: string, startDate = '2099-01-01', extra: Record<string, unknown> = {}) =>
	createEvent(db, eventInput.parse({ name, type: 'gig', startDate, endDate: startDate, ...extra }));
const person = (db: Db, name: string, extra: Record<string, unknown> = {}) =>
	createPerson(db, personInput.parse({ name, ...extra }));
const task = (db: Db, eventId: number, title: string) => {
	const s = addSection(db, eventId, 'S');
	return addTask(db, eventId, s, taskInput.parse({ title }));
};
const owner: Actor = { kind: 'owner', user: { id: 1, email: 'o@x.dev', name: 'O', role: 'owner', personId: null } };
function crewFor(db: Db, personId: number): Actor {
	const u = db.insert(users).values({ email: `c${personId}@x.dev`, name: 'C', passwordHash: 'x', role: 'crew', personId, createdAt: 0 }).returning().get();
	return { kind: 'crew', user: { id: u.id, email: u.email, name: u.name, role: 'crew', personId } };
}

describe('search', () => {
	it('finds a person by prefix', () => {
		const db = createTestDb();
		const p = person(db, 'Jess Lighting');
		const r = search(db, owner, 'jes');
		expect(r).toHaveLength(1);
		expect(r[0]).toMatchObject({ kind: 'person', refId: p, title: 'Jess Lighting' });
	});

	it('does not throw on quotes, parentheses and operators; empty gives []', () => {
		const db = createTestDb();
		person(db, 'Jess Lighting');
		for (const q of ['"', '(', 'a" OR "b', 'jess)', 'NEAR(', '*', '-x', 'AND', 'col:val'])
			expect(() => search(db, owner, q)).not.toThrow();
		expect(search(db, owner, '   ')).toEqual([]);
		expect(search(db, owner, '')).toEqual([]);
	});

	it('hides tasks on unassigned events from crew, shows them for assigned', () => {
		const db = createTestDb();
		const mine = ev(db, 'Mine');
		const other = ev(db, 'Other');
		task(db, mine, 'Rig truss');
		task(db, other, 'Rig lasers');
		const me = person(db, 'Crew Member');
		assign(db, mine, me, {});
		const crew = crewFor(db, me);
		const r = search(db, crew, 'rig');
		expect(r.map((x) => x.title)).toEqual(['Rig truss']);
		expect(search(db, owner, 'rig')).toHaveLength(2);
		expect(search(db, crew, 'other')).toEqual([]);
	});

	it('crew only find people on their events and link via a shared event', () => {
		const db = createTestDb();
		const e1 = ev(db, 'Past', '2000-01-01');
		const e2 = ev(db, 'Soon', '2098-01-01');
		const e3 = ev(db, 'Later', '2099-01-01');
		const e4 = ev(db, 'Elsewhere');
		const me = person(db, 'Me Crew');
		const mate = person(db, 'Mate Sparks');
		const stranger = person(db, 'Stranger Sparks');
		for (const e of [e1, e2, e3]) { assign(db, e, me, {}); assign(db, e, mate, {}); }
		assign(db, e4, stranger, {});
		const crew = crewFor(db, me);
		const r = search(db, crew, 'sparks');
		expect(r).toHaveLength(1);
		expect(r[0]).toMatchObject({ kind: 'person', refId: mate, eventId: e2 });
		expect(search(db, owner, 'sparks')).toHaveLength(2);
	});

	it('crew link falls back to most recent shared event when none upcoming', () => {
		const db = createTestDb();
		const a = ev(db, 'A', '2000-01-01');
		const b = ev(db, 'B', '2001-01-01');
		const me = person(db, 'Me Crew');
		const mate = person(db, 'Mate Sparks');
		for (const e of [a, b]) { assign(db, e, me, {}); assign(db, e, mate, {}); }
		expect(search(db, crewFor(db, me), 'mate')[0].eventId).toBe(b);
	});

	it('does not index phone, email, needs or notes of a person', () => {
		const db = createTestDb();
		person(db, 'Ann', { phone: '07700900123', email: 'ann-secret@x.dev', needs: 'peanutallergy', notes: 'privatenote', tags: 'rigger' });
		expect(search(db, owner, '07700900123')).toEqual([]);
		expect(search(db, owner, 'secret')).toEqual([]);
		expect(search(db, owner, 'peanutallergy')).toEqual([]);
		expect(search(db, owner, 'privatenote')).toEqual([]);
		expect(search(db, owner, 'rigger')).toHaveLength(1);
	});

	it('crew cannot find a phone number even of an assigned person', () => {
		const db = createTestDb();
		const e = ev(db, 'E');
		const me = person(db, 'Me Crew');
		const mate = person(db, 'Mate', { phone: '07700900555' });
		assign(db, e, me, {}); assign(db, e, mate, {});
		expect(search(db, crewFor(db, me), '07700900555')).toEqual([]);
	});

	it('snippets carry private marker chars around matches', () => {
		const db = createTestDb();
		ev(db, 'Festival', '2099-01-01', { notes: 'bring the generator early' });
		const r = search(db, owner, 'generator');
		expect(r[0].snippet).toContain('\u0002generator\u0003');
	});

	it('removed docs disappear; title uses current value', () => {
		const db = createTestDb();
		const p = person(db, 'Zed Gone');
		deletePerson(db, p);
		expect(search(db, owner, 'zed')).toEqual([]);
	});

	it('caps results at 30', () => {
		const db = createTestDb();
		for (let i = 0; i < 40; i++) person(db, `Bulk ${i}`);
		expect(search(db, owner, 'bulk')).toHaveLength(30);
	});

	it('rebuildSearchIndex backfills from the tables', () => {
		const db = createTestDb();
		const e = ev(db, 'Gala');
		task(db, e, 'Order banners');
		person(db, 'Pat Stage');
		db.$client.exec('DELETE FROM search_index');
		expect(search(db, owner, 'gala')).toEqual([]);
		rebuildSearchIndex(db);
		expect(search(db, owner, 'gala')).toHaveLength(1);
		expect(search(db, owner, 'banners')).toHaveLength(1);
		expect(search(db, owner, 'pat')).toHaveLength(1);
		rebuildSearchIndex(db); // idempotent, no duplicates
		expect(search(db, owner, 'gala')).toHaveLength(1);
	});

	it('crew are not starved by 600 owner-only matches outranking theirs', () => {
		const db = createTestDb();
		const mine = ev(db, 'Mine');
		const other = ev(db, 'Other');
		const sec = addSection(db, other, 'S');
		for (let i = 0; i < 600; i++) addTask(db, other, sec, taskInput.parse({ title: `widget widget widget ${i}` }));
		task(db, mine, 'one widget only');
		const me = person(db, 'Me');
		assign(db, mine, me, {});
		const r = search(db, crewFor(db, me), 'widget');
		expect(r.map((x) => x.title)).toEqual(['one widget only']);
		expect(search(db, owner, 'widget')).toHaveLength(30);
	});

	it('renamed event shows current title; deleted event and task rows vanish and self-heal', () => {
		const db = createTestDb();
		const e = ev(db, 'Oldname');
		updateEvent(db, e, eventInput.parse({ name: 'Newname', type: 'gig', startDate: '2099-01-01', endDate: '2099-01-01' }));
		expect(search(db, owner, 'oldname')).toEqual([]);
		expect(search(db, owner, 'newname')[0].title).toBe('Newname');
		const t = task(db, e, 'Zebra job');
		deleteTask(db, t);
		expect(search(db, owner, 'zebra')).toEqual([]);
		const e2 = ev(db, 'Gone');
		task(db, e2, 'Yak chore');
		deleteEvent(db, e2);
		expect(search(db, owner, 'gone')).toEqual([]);
		expect(search(db, owner, 'yak')).toEqual([]);
		const left = db.$client.prepare("SELECT count(*) c FROM search_index WHERE text LIKE '%Yak%' OR text LIKE '%Gone%'").get() as { c: number };
		expect(left.c).toBe(0);
	});

	it('strips marker chars at index time', () => {
		const db = createTestDb();
		ev(db, 'Marker show');
		expect(search(db, owner, 'marker')[0].snippet).not.toMatch(/^[^]*/);
	});

	it('sanitizeQuery handles punctuation', () => {
		expect(sanitizeQuery('   ')).toBeNull();
		for (const q of ['(', '"', '--']) {
			const m = sanitizeQuery(q);
			expect(m === null || typeof m === 'string').toBe(true);
			expect(() => search(createTestDb(), owner, q)).not.toThrow();
		}
	});
});
