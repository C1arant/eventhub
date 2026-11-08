import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../src/lib/server/db/test-db';
import type { DB } from '../../src/lib/server/db';
import { hashPassword, verifyPassword } from '../../src/lib/server/auth/password';
import {
	createSession,
	validateSession,
	deleteSession,
	deleteAllSessions
} from '../../src/lib/server/auth/sessions';
import { checkLimit, recordFailure, recordSuccess } from '../../src/lib/server/auth/ratelimit';
import {
	hasOwner,
	createOwner,
	createInvite,
	acceptInvite,
	getUserByEmail
} from '../../src/lib/server/auth/users';

const DAY = 86_400_000;
let db: DB;
beforeEach(() => {
	db = createTestDb();
});

describe('password', () => {
	it('round-trips', async () => {
		const h = await hashPassword('correct horse');
		expect(h).toContain('argon2id');
		expect(await verifyPassword(h, 'correct horse')).toBe(true);
		expect(await verifyPassword(h, 'wrong')).toBe(false);
	});
	it('returns false for a malformed hash', async () => {
		expect(await verifyPassword('garbage', 'x')).toBe(false);
	});
});

describe('sessions', () => {
	it('valid session returns user; expired returns null', async () => {
		const u = await createOwner(db, { email: 'o@x.com', name: 'O', password: 'password123' });
		const now = 1_000_000;
		const t = createSession(db, u.id, now);
		expect(validateSession(db, t, now + 1000)?.id).toBe(u.id);
		expect(validateSession(db, t, now + 31 * DAY)).toBeNull();
		expect(validateSession(db, 'nope', now)).toBeNull();
	});
	it('slides expiry when < 29 days remain', async () => {
		const u = await createOwner(db, { email: 'o@x.com', name: 'O', password: 'password123' });
		const now = 1_000_000;
		const t = createSession(db, u.id, now);
		validateSession(db, t, now + 2 * DAY);
		// extended to now+2d+30d, so still valid at day 31
		expect(validateSession(db, t, now + 31 * DAY)?.id).toBe(u.id);
	});
	it('does not write when plenty of time remains', async () => {
		const u = await createOwner(db, { email: 'o@x.com', name: 'O', password: 'password123' });
		const now = 1_000_000;
		const t = createSession(db, u.id, now);
		validateSession(db, t, now + 1000);
		expect(validateSession(db, t, now + 30 * DAY + 1)).toBeNull();
	});
	it('deleteSession and deleteAllSessions invalidate', async () => {
		const u = await createOwner(db, { email: 'o@x.com', name: 'O', password: 'password123' });
		const a = createSession(db, u.id, 1);
		const b = createSession(db, u.id, 1);
		deleteSession(db, a);
		expect(validateSession(db, a, 2)).toBeNull();
		expect(validateSession(db, b, 2)).not.toBeNull();
		deleteAllSessions(db, u.id);
		expect(validateSession(db, b, 2)).toBeNull();
	});
});

describe('rate limit', () => {
	it('allows until 5 failures; 5th failure locks for 1s', () => {
		for (let i = 0; i < 4; i++) recordFailure(db, 'ip:1', 1000);
		expect(checkLimit(db, 'ip:1', 1000).allowed).toBe(true);
		recordFailure(db, 'ip:1', 1000);
		expect(checkLimit(db, 'ip:1', 1000)).toEqual({ allowed: false, retryAfterSec: 1 });
		expect(checkLimit(db, 'ip:1', 2000).allowed).toBe(true);
	});
	it('10 failures -> 32s', () => {
		for (let i = 0; i < 10; i++) recordFailure(db, 'k', 1000);
		expect(checkLimit(db, 'k', 1000)).toEqual({ allowed: false, retryAfterSec: 32 });
		expect(checkLimit(db, 'k', 1000 + 31_000).allowed).toBe(false);
		expect(checkLimit(db, 'k', 1000 + 32_000).allowed).toBe(true);
	});
	it('caps at 900s', () => {
		for (let i = 0; i < 40; i++) recordFailure(db, 'k', 1000);
		expect(checkLimit(db, 'k', 1000)).toEqual({ allowed: false, retryAfterSec: 900 });
	});
	it('recordSuccess resets', () => {
		for (let i = 0; i < 6; i++) recordFailure(db, 'k', 1000);
		recordSuccess(db, 'k');
		expect(checkLimit(db, 'k', 1000).allowed).toBe(true);
		recordFailure(db, 'k', 1000);
		expect(checkLimit(db, 'k', 1000).allowed).toBe(true);
	});
	it('keys are independent', () => {
		for (let i = 0; i < 5; i++) recordFailure(db, 'a', 1000);
		expect(checkLimit(db, 'b', 1000).allowed).toBe(true);
	});
});

describe('users and invites', () => {
	it('createOwner twice throws; hasOwner reflects', async () => {
		expect(hasOwner(db)).toBe(false);
		const u = await createOwner(db, { email: 'o@x.com', name: 'O', password: 'password123' });
		expect(u).toEqual({ id: u.id, email: 'o@x.com', name: 'O', role: 'owner', personId: null });
		expect(hasOwner(db)).toBe(true);
		await expect(
			createOwner(db, { email: 'p@x.com', name: 'P', password: 'password123' })
		).rejects.toThrow();
	});
	it('invite accepted once; second accept throws', async () => {
		const now = 5_000;
		const tok = createInvite(db, { email: 'Crew@X.com' }, now);
		const u = await acceptInvite(db, tok, { name: 'Crew', password: 'password123' }, now + 1);
		expect(u.role).toBe('crew');
		expect(u.email).toBe('crew@x.com');
		await expect(
			acceptInvite(db, tok, { name: 'Again', password: 'password123' }, now + 2)
		).rejects.toThrow();
	});
	it('expired invite throws; unknown token throws', async () => {
		const now = 5_000;
		const tok = createInvite(db, { email: 'c@x.com' }, now);
		await expect(
			acceptInvite(db, tok, { name: 'C', password: 'password123' }, now + 7 * DAY + 1)
		).rejects.toThrow();
		await expect(
			acceptInvite(db, 'bogus', { name: 'C', password: 'password123' }, now)
		).rejects.toThrow();
	});
	it('getUserByEmail is case-insensitive', async () => {
		await createOwner(db, { email: 'a@x.com', name: 'A', password: 'password123' });
		expect(getUserByEmail(db, 'A@X.com')?.email).toBe('a@x.com');
		expect(getUserByEmail(db, 'z@x.com')).toBeNull();
	});
});
