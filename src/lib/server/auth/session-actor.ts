import type { Cookies } from '@sveltejs/kit';
import type { DB } from '../db';
import type { Actor } from './can';
import { SESSION_COOKIE, setSessionCookie } from './cookie';
import { validateSessionWithRefresh } from './sessions';

/** Resolve the session cookie to an owner/crew actor; re-issues the cookie when the session slides. */
export function actorFromSession(
	db: DB,
	cookies: Pick<Cookies, 'get' | 'set'>,
	url: URL,
	now = Date.now()
): Actor {
	const token = cookies.get(SESSION_COOKIE);
	if (!token) return { kind: 'anon' };
	const { user, refreshed } = validateSessionWithRefresh(db, token, now);
	if (!user) return { kind: 'anon' };
	if (refreshed) setSessionCookie(cookies as Cookies, url, token);
	if (user.role === 'owner') return { kind: 'owner', user };
	if (user.role === 'crew') return { kind: 'crew', user };
	return { kind: 'anon' };
}
