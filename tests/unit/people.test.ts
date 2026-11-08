import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../src/lib/server/db/test-db';
import { createGuestLink, resolveGuestToken } from '../../src/lib/server/auth/guests';
import { createEvent, eventInput, listDays } from '../../src/lib/server/events';
import {
	assign, callSheet, createPerson, deletePerson, getPerson, listGuestLinks, listPeople, parseTags,
	personInput, setDayCallTime, unassign, updateAssignment, updatePerson
} from '../../src/lib/server/people';

type Db = ReturnType<typeof createTestDb>;
const ev = (db: Db, name = 'Show', d = '2026-03-10') =>
	createEvent(db, eventInput.parse({ name, type: 'gig', startDate: d, endDate: d }));
const person = (db: Db, name: string, extra: Record<string, unknown> = {}) =>
	createPerson(db, personInput.parse({ name, ...extra }));

describe('people', () => {
	it('parses tags: trimmed, lowercased, de-duplicated', () => {
		expect(parseTags(' Sound, LIGHTING,sound ,, ')).toEqual(['sound', 'lighting']);
		const db = createTestDb();
		const id = person(db, 'Ann', { tags: 'Sound, sound, Stage' });
		expect(getPerson(db, id)!.tags).toEqual(['sound', 'stage']);
	});

	it('validates email when present and allows blank phone/email', () => {
		expect(personInput.safeParse({ name: 'A', email: 'nope' }).success).toBe(false);
		expect(personInput.safeParse({ name: 'A' }).success).toBe(true);
		expect(personInput.safeParse({ name: ' ' }).success).toBe(false);
	});

	it('lists with tag and text filters; update and delete', () => {
		const db = createTestDb();
		const a = person(db, 'Ann', { tags: 'sound', phone: '0123' });
		person(db, 'Bob', { tags: 'lighting,sound' });
		person(db, 'Cy', { tags: 'soundman' });
		expect(listPeople(db, {}).map((p) => p.name)).toEqual(['Ann', 'Bob', 'Cy']);
		expect(listPeople(db, { tag: 'sound' }).map((p) => p.name)).toEqual(['Ann', 'Bob']);
		expect(listPeople(db, { q: 'bo' }).map((p) => p.name)).toEqual(['Bob']);
		expect(listPeople(db, { q: '0123' }).map((p) => p.name)).toEqual(['Ann']);
		updatePerson(db, a, personInput.parse({ name: 'Anna', tags: 'video' }));
		expect(getPerson(db, a)!.name).toBe('Anna');
		expect(listPeople(db, { tag: 'video' })).toHaveLength(1);
		deletePerson(db, a);
		expect(getPerson(db, a)).toBeUndefined();
	});

	it('rejects assigning the same person twice', () => {
		const db = createTestDb();
		const e = ev(db);
		const p = person(db, 'Ann');
		assign(db, e, p, { eventRole: 'FOH' });
		expect(() => assign(db, e, p, { eventRole: 'Again' })).toThrow();
	});

	it('callSheet sorts by call time then name, null times last, with day calls', () => {
		const db = createTestDb();
		const e = ev(db);
		const [day] = listDays(db, e);
		const ids = {
			zed: assign(db, e, person(db, 'Zed', { phone: '1' }), { eventRole: 'Stage', callTime: '16:00' }),
			amy: assign(db, e, person(db, 'Amy', { needs: 'vegan' }), { eventRole: 'Sound', callTime: '16:00' }),
			bo: assign(db, e, person(db, 'Bo'), { eventRole: 'Light', callTime: '14:30' }),
			none: assign(db, e, person(db, 'Cat'), { eventRole: 'Host' })
		};
		setDayCallTime(db, ids.bo, day.id, '13:00');
		const rows = callSheet(db, e, { includePrivate: true });
		expect(rows.map((r) => r.name)).toEqual(['Bo', 'Amy', 'Zed', 'Cat']);
		expect(rows[0].dayCalls).toEqual([{ dayLabel: day.label, callTime: '13:00' }]);
		expect(rows[1].needs).toBe('vegan');
		expect(rows[2].phone).toBe('1');
		expect(rows[3].callTime).toBeNull();
		// updating an existing day call replaces it; blank clears it
		setDayCallTime(db, ids.bo, day.id, '12:00');
		expect(callSheet(db, e, { includePrivate: true })[0].dayCalls).toEqual([{ dayLabel: day.label, callTime: '12:00' }]);
		setDayCallTime(db, ids.bo, day.id, null);
		expect(callSheet(db, e, { includePrivate: true })[0].dayCalls).toEqual([]);
	});

	it('updateAssignment changes role, call time and show caller', () => {
		const db = createTestDb();
		const e = ev(db);
		const a = assign(db, e, person(db, 'Ann'), { eventRole: 'x' });
		updateAssignment(db, a, { eventRole: 'FOH', callTime: '10:00', isShowCaller: true });
		const r = callSheet(db, e, { includePrivate: true })[0];
		expect(r.eventRole).toBe('FOH');
		expect(r.callTime).toBe('10:00');
	});

	it('person history lists events newest first', () => {
		const db = createTestDb();
		const p = person(db, 'Ann');
		const old = ev(db, 'Old', '2025-01-01');
		const mid = ev(db, 'Mid', '2026-03-10');
		const late = ev(db, 'Late', '2026-12-01');
		for (const [e, role] of [[mid, 'b'], [old, 'a'], [late, 'c']] as const) assign(db, e, p, { eventRole: role });
		const h = getPerson(db, p)!.history;
		expect(h.map((x) => x.eventName)).toEqual(['Late', 'Mid', 'Old']);
		expect(h[0]).toMatchObject({ eventId: late, startDate: '2026-12-01', eventRole: 'c' });
	});

	it('unassign makes their guest link resolve to null', () => {
		const db = createTestDb();
		const e = ev(db);
		const a = assign(db, e, person(db, 'Ann'), { eventRole: 'Artist' });
		const token = createGuestLink(db, a, { liveAccess: false, expiresAt: Date.now() + 86_400_000 });
		expect(resolveGuestToken(db, token, Date.now())).not.toBeNull();
		expect(listGuestLinks(db, e)).toHaveLength(1);
		unassign(db, a);
		expect(resolveGuestToken(db, token, Date.now())).toBeNull();
		expect(listGuestLinks(db, e)).toHaveLength(0);
	});
});
