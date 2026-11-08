import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../src/lib/server/db/test-db';
import { createOwner } from '../../src/lib/server/auth/users';
import { createSession, validateSessionWithRefresh, SESSION_TTL_MS } from '../../src/lib/server/auth/sessions';
import { actorFromSession } from '../../src/lib/server/auth/session-actor';

const DAY = 86_400_000;
async function setup() {
	const db = createTestDb();
	const u = await createOwner(db, { email: 'a@b.com', name: 'A', password: 'correct-horse-1' });
	const t0 = 1_000_000_000_000;
	return { db, u, t0, token: createSession(db, u.id, t0) };
}
const fakeCookies = (token?: string) => {
	const sets: any[] = [];
	return {
		sets,
		get: (n: string) => (n === 'eh_session' ? token : undefined),
		set: (...a: any[]) => void sets.push(a)
	} as any;
};

describe('sliding session refresh', () => {
	it('no refresh signal when 29+ days remain', async () => {
		const { db, token, t0 } = await setup();
		expect(validateSessionWithRefresh(db, token, t0 + DAY / 2).refreshed).toBe(false);
	});
	it('refresh signal when less than 29 days remain', async () => {
		const { db, token, t0 } = await setup();
		const r = validateSessionWithRefresh(db, token, t0 + 2 * DAY);
		expect(r.refreshed).toBe(true);
		expect(r.user).not.toBeNull();
		// expiry slid: still valid just after the original expiry
		expect(validateSessionWithRefresh(db, token, t0 + SESSION_TTL_MS + DAY).user).not.toBeNull();
	});
	it('unknown or expired token: no user, no refresh', async () => {
		const { db, token, t0 } = await setup();
		expect(validateSessionWithRefresh(db, 'nope', t0)).toEqual({ user: null, refreshed: false });
		expect(validateSessionWithRefresh(db, token, t0 + SESSION_TTL_MS + 1)).toEqual({ user: null, refreshed: false });
	});
	it('hook path re-sets the cookie only when refreshed', async () => {
		const { db, token, t0 } = await setup();
		const url = new URL('https://x.test/');
		const fresh = fakeCookies(token);
		expect(actorFromSession(db, fresh, url, t0 + DAY / 2).kind).toBe('owner');
		expect(fresh.sets).toHaveLength(0);
		const slid = fakeCookies(token);
		expect(actorFromSession(db, slid, url, t0 + 2 * DAY).kind).toBe('owner');
		expect(slid.sets).toHaveLength(1);
		expect(slid.sets[0][0]).toBe('eh_session');
		expect(slid.sets[0][1]).toBe(token);
		expect(slid.sets[0][2]).toMatchObject({ httpOnly: true, secure: true, maxAge: 2592000 });
		expect(actorFromSession(db, fakeCookies(), url, t0).kind).toBe('anon');
	});
});
