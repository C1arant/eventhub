import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../src/lib/server/db/test-db';
import { assignments, eventDays, events, people } from '../../src/lib/server/db/schema';
import { can, type Action, type Actor } from '../../src/lib/server/auth/can';

const ACTIONS: Action[] = [
	'event:view', 'event:edit', 'event:create', 'tasks:edit', 'people:view', 'people:edit',
	'callsheet:view', 'ros:view', 'ros:edit', 'live:view', 'live:control', 'files:upload',
	'guest:manage', 'users:manage', 'settings:manage'
];
const CREW_ASSIGNED: Action[] = [
	'event:view', 'tasks:edit', 'people:view', 'callsheet:view', 'ros:view', 'ros:edit',
	'live:view', 'files:upload'
];

function setup() {
	const db = createTestDb();
	const mkEvent = (name: string) =>
		db.insert(events).values({ name, type: 'gig', startDate: '2026-01-01', endDate: '2026-01-01', createdAt: 0 }).returning().get();
	const A = mkEvent('A');
	const B = mkEvent('B');
	const dayA = db.insert(eventDays).values({ eventId: A.id, label: 'd', date: '2026-01-01' }).returning().get();
	const mkPerson = (n: string) => db.insert(people).values({ name: n }).returning().get();
	const pCrew = mkPerson('crew');
	const pCaller = mkPerson('caller');
	const pOther = mkPerson('other');
	db.insert(assignments).values({ eventId: A.id, personId: pCrew.id }).run();
	db.insert(assignments).values({ eventId: A.id, personId: pCaller.id, isShowCaller: true }).run();
	const user = (id: number, personId: number | null, role: 'owner' | 'crew') => ({
		id, email: `u${id}@x.com`, name: `u${id}`, role, personId
	});
	const actors: Record<string, Actor> = {
		owner: { kind: 'owner', user: user(1, null, 'owner') },
		crew: { kind: 'crew', user: user(2, pCrew.id, 'crew') },
		caller: { kind: 'crew', user: user(3, pCaller.id, 'crew') },
		unassigned: { kind: 'crew', user: user(4, pOther.id, 'crew') },
		guestLive: { kind: 'guest', assignmentId: 1, eventId: A.id, personId: pCrew.id, liveAccess: true },
		guestNoLive: { kind: 'guest', assignmentId: 1, eventId: A.id, personId: pCrew.id, liveAccess: false },
		display: { kind: 'display', eventId: A.id },
		anon: { kind: 'anon' }
	};
	return { db, A, B, dayA, actors };
}

describe('can', () => {
	const { db, A, B, dayA, actors } = setup();
	const expected = (who: string, a: Action): boolean => {
		switch (who) {
			case 'owner': return true;
			case 'crew': return CREW_ASSIGNED.includes(a);
			case 'caller': return CREW_ASSIGNED.includes(a) || a === 'live:control';
			case 'guestLive': return a === 'live:view';
			case 'display': return a === 'live:view';
			default: return false;
		}
	};
	for (const who of Object.keys(actors)) {
		for (const a of ACTIONS) {
			it(`${who} ${a} on event A`, () => {
				expect(can(db, actors[who], a, { eventId: A.id })).toBe(expected(who, a));
			});
		}
	}

	it('crew with dayId resolves the event', () => {
		expect(can(db, actors.crew, 'ros:edit', { dayId: dayA.id })).toBe(true);
		expect(can(db, actors.unassigned, 'ros:edit', { dayId: dayA.id })).toBe(false);
		expect(can(db, actors.caller, 'live:control', { dayId: dayA.id })).toBe(true);
		expect(can(db, actors.crew, 'live:control', { dayId: dayA.id })).toBe(false);
	});

	it('missing or unknown resource denies non-owners', () => {
		expect(can(db, actors.crew, 'event:view')).toBe(false);
		expect(can(db, actors.crew, 'event:view', { eventId: 9999 })).toBe(false);
		expect(can(db, actors.crew, 'ros:view', { dayId: 9999 })).toBe(false);
		expect(can(db, actors.owner, 'event:view', { eventId: 9999 })).toBe(true);
		expect(can(db, actors.display, 'live:view')).toBe(false);
	});

	it('other events are denied', () => {
		expect(can(db, actors.crew, 'event:view', { eventId: B.id })).toBe(false);
		expect(can(db, actors.caller, 'live:control', { eventId: B.id })).toBe(false);
		expect(can(db, actors.guestLive, 'live:view', { eventId: B.id })).toBe(false);
		expect(can(db, actors.display, 'live:view', { eventId: B.id })).toBe(false);
	});

	it('guest never sees callsheet, people, or event', () => {
		for (const a of ['callsheet:view', 'people:view', 'event:view'] as Action[])
			expect(can(db, actors.guestLive, a, { eventId: A.id })).toBe(false);
	});

	it('crew with no personId is denied', () => {
		const c: Actor = { kind: 'crew', user: { id: 9, email: 'z@x.com', name: 'z', role: 'crew', personId: null } };
		expect(can(db, c, 'event:view', { eventId: A.id })).toBe(false);
	});
});
