import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../src/lib/server/db/test-db';
import { requireActor } from '../../src/lib/server/guard';
import type { Actor } from '../../src/lib/server/auth/can';

const db = createTestDb();
const user = (role: 'owner' | 'crew') => ({
	id: 1, email: 'a@b.com', name: 'A', role, personId: null
});
const loc = (actor: Actor) => ({ actor });

function thrown(fn: () => unknown): any {
	try {
		fn();
	} catch (e) {
		return e;
	}
	throw new Error('did not throw');
}

describe('requireActor', () => {
	it('anon is redirected to /login', () => {
		const e = thrown(() => requireActor(loc({ kind: 'anon' }), 'event:create', undefined, db));
		expect(e.status).toBe(303);
		expect(e.location).toBe('/login');
	});
	it('crew without permission gets 403', () => {
		const e = thrown(() =>
			requireActor(loc({ kind: 'crew', user: user('crew') }), 'event:create', undefined, db)
		);
		expect(e.status).toBe(403);
	});
	it('guest forbidden gets 404 Link no longer valid', () => {
		const guest: Actor = { kind: 'guest', assignmentId: 1, eventId: 1, personId: 1, liveAccess: false };
		const e = thrown(() => requireActor(loc(guest), 'event:edit', undefined, db));
		expect(e.status).toBe(404);
		expect(e.body.message).toBe('Link no longer valid');
	});
	it('display forbidden gets 404', () => {
		const e = thrown(() => requireActor(loc({ kind: 'display', eventId: 1 }), 'event:edit', undefined, db));
		expect(e.status).toBe(404);
	});
	it('owner is allowed and returned', () => {
		const actor: Actor = { kind: 'owner', user: user('owner') };
		expect(requireActor(loc(actor), 'settings:manage', undefined, db)).toBe(actor);
	});
});

describe('requireUser', () => {
	it('anon redirects, guest/display 404, owner/crew pass', async () => {
		const { requireUser } = await import('../../src/lib/server/guard');
		expect(thrown(() => requireUser(loc({ kind: 'anon' }))).location).toBe('/login');
		expect(thrown(() => requireUser(loc({ kind: 'display', eventId: 1 }))).status).toBe(404);
		expect(requireUser(loc({ kind: 'crew', user: user('crew') })).kind).toBe('crew');
		expect(requireUser(loc({ kind: 'owner', user: user('owner') })).kind).toBe('owner');
	});
});
