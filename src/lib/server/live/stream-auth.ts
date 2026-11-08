import { can, type Actor } from '../auth/can.js';
import type { DB } from '../db/index.js';
import { resolveDisplayToken, resolveGuestToken } from '../auth/guests.js';
import { peekSession } from '../auth/sessions.js';
import { getDay } from '../ros.js';

export type StreamCredentials = { session?: string | null; token?: string | null };

/** Re-resolve the actor from the credentials the stream was opened with. A valid session wins; otherwise the token is tried (mirrors hooks). */
export function actorFromCredentials(db: DB, c: StreamCredentials, now: number): Actor {
	if (c.session) {
		const user = peekSession(db, c.session, now);
		if (user?.role === 'owner') return { kind: 'owner', user };
		if (user?.role === 'crew') return { kind: 'crew', user };
	}
	if (c.token) return resolveGuestToken(db, c.token, now) ?? resolveDisplayToken(db, c.token) ?? { kind: 'anon' };
	return { kind: 'anon' };
}

/** Called on every heartbeat: is this stream still allowed to see the day? */
export function stillAllowed(db: DB, c: StreamCredentials, dayId: number, now: number): boolean {
	if (!getDay(db, dayId)) return false;
	return can(db, actorFromCredentials(db, c, now), 'live:view', { dayId });
}

/** One heartbeat: ping if still allowed, close if not or if the check itself fails. Never throws. */
export function heartbeatTick(check: () => boolean, write: (s: string) => void, close: () => void): void {
	try {
		if (!check()) return close();
		write(': ping\n\n');
	} catch (err) {
		console.error('live heartbeat failed', err instanceof Error ? err.message : 'unknown error');
		close();
	}
}
