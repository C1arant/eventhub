import { error } from '@sveltejs/kit';
import { resolveGuestToken } from '#lib/server/auth/guests.js';
import { getDb } from '#lib/server/db/index.js';
import { liveSnapshot } from '#lib/server/live/store.js';
import { wireSnapshot } from '#lib/server/live/trim.js';
import { dayInEvent } from '#lib/server/ros.js';

export const load = ({ params, setHeaders }) => {
	const db = getDb();
	const dayId = Number(params.dayId);
	const actor = resolveGuestToken(db, params.token, Date.now());
	// Same message for every failure: bad token, no live access, or a day from another event.
	if (!actor || !actor.liveAccess || !Number.isInteger(dayId) || !dayInEvent(db, actor.eventId, dayId)) {
		error(404, 'This link is no longer valid');
	}
	setHeaders({ 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
	return { token: params.token, dayId, snapshot: wireSnapshot(liveSnapshot(db, dayId)) };
};
