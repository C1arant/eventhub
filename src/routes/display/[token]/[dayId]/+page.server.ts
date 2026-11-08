import { error } from '@sveltejs/kit';
import { resolveDisplayToken } from '#lib/server/auth/guests.js';
import { getDb } from '#lib/server/db/index.js';
import { liveSnapshot } from '#lib/server/live/store.js';
import { wireSnapshot } from '#lib/server/live/trim.js';
import { dayInEvent } from '#lib/server/ros.js';

export const load = ({ params }) => {
	const db = getDb();
	const dayId = Number(params.dayId);
	const actor = resolveDisplayToken(db, params.token);
	// Same message for a bad token and a day from another event: reveal nothing.
	if (!actor || !dayInEvent(db, actor.eventId, dayId)) error(404, 'This link is no longer valid');
	return { token: params.token, dayId, snapshot: wireSnapshot(liveSnapshot(db, dayId)) };
};
