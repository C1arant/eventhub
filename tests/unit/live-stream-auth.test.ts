import { describe, expect, it } from 'vitest';
import { createSession, deleteSession } from '../../src/lib/server/auth/sessions';
import { createDisplayToken, revokeDisplayToken } from '../../src/lib/server/auth/guests';
import { createOwner } from '../../src/lib/server/auth/users';
import { createTestDb } from '../../src/lib/server/db/test-db';
import { createEvent, eventInput, listDays } from '../../src/lib/server/events';
import { stillAllowed } from '../../src/lib/server/live/stream-auth';
import { displayTokens } from '../../src/lib/server/db/schema';

describe('stillAllowed', () => {
	it('rejects missing credentials, accepts a display token, rejects after revoke', async () => {
		const db = createTestDb();
		const e = createEvent(db, eventInput.parse({ name: 'S', type: 'club', startDate: '2026-03-10', endDate: '2026-03-10' }));
		const e2 = createEvent(db, eventInput.parse({ name: 'T', type: 'club', startDate: '2026-03-10', endDate: '2026-03-10' }));
		const day = listDays(db, e)[0];
		const day2 = listDays(db, e2)[0];
		expect(stillAllowed(db, {}, day.id, Date.now())).toBe(false);
		const tok = createDisplayToken(db, e);
		expect(stillAllowed(db, { token: tok }, day.id, Date.now())).toBe(true);
		expect(stillAllowed(db, { token: tok }, day2.id, Date.now())).toBe(false);
		const row = db.select().from(displayTokens).get()!;
		revokeDisplayToken(db, row.id);
		expect(stillAllowed(db, { token: tok }, day.id, Date.now())).toBe(false);
	});

	it('session: valid then deleted', async () => {
		const db = createTestDb();
		const e = createEvent(db, eventInput.parse({ name: 'S', type: 'club', startDate: '2026-03-10', endDate: '2026-03-10' }));
		const day = listDays(db, e)[0];
		const owner = await createOwner(db, { name: 'O', email: 'o@x.co', password: 'password-long-1' });
		const tok = createSession(db, owner.id);
		expect(stillAllowed(db, { session: tok }, day.id, Date.now())).toBe(true);
		expect(stillAllowed(db, { session: 'garbage' }, day.id, Date.now())).toBe(false);
		deleteSession(db, tok);
		expect(stillAllowed(db, { session: tok }, day.id, Date.now())).toBe(false);
	});
});

describe('peekSession / heartbeat', () => {
	it('does not slide the session expiry', async () => {
		const { peekSession } = await import('../../src/lib/server/auth/sessions');
		const { sessions } = await import('../../src/lib/server/db/schema');
		const db = createTestDb();
		const owner = await createOwner(db, { name: 'O', email: 'o@x.co', password: 'password-long-1' });
		const now = Date.now();
		const tok = createSession(db, owner.id, now - 5 * 86400_000);
		const before = db.select().from(sessions).get()!.expiresAt;
		expect(peekSession(db, tok, now)?.id).toBe(owner.id);
		expect(db.select().from(sessions).get()!.expiresAt).toBe(before);
		expect(peekSession(db, tok, before + 1)).toBeNull();
	});
	it('redacts tokens in logged paths', async () => {
		const { redactPath } = await import('../../src/hooks.server');
		expect(redactPath('/display/SECRET/3')).toBe('/display/[redacted]/3');
		expect(redactPath('/g/SECRET/live/3')).toBe('/g/[redacted]/live/3');
		expect(redactPath('/events/1')).toBe('/events/1');
	});
});

describe('heartbeatTick', () => {
	it('pings when allowed, closes when denied, closes (no throw) when the check throws', async () => {
		const { heartbeatTick } = await import('../../src/lib/server/live/stream-auth');
		const w: string[] = [];
		let closed = 0;
		heartbeatTick(() => true, (s) => w.push(s), () => closed++);
		expect(w).toEqual([': ping\n\n']);
		expect(closed).toBe(0);
		heartbeatTick(() => false, (s) => w.push(s), () => closed++);
		expect(w.length).toBe(1);
		expect(closed).toBe(1);
		expect(() => heartbeatTick(() => { throw new Error('db gone'); }, (s) => w.push(s), () => closed++)).not.toThrow();
		expect(closed).toBe(2);
		expect(w.length).toBe(1);
	});
});
