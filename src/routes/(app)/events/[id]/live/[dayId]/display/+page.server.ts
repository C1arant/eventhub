import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { getEvent } from '#lib/server/events.js';
import { requireActor } from '#lib/server/guard.js';
import { liveSnapshot } from '#lib/server/live/store.js';
import { wireSnapshot } from '#lib/server/live/trim.js';
import { dayInEvent } from '#lib/server/ros.js';

// Crew/owner full-screen display: authorised by the session cookie instead of a display token.
export const load = ({ locals, params }) => {
	const eventId = Number(params.id);
	const dayId = Number(params.dayId);
	if (!Number.isInteger(eventId) || eventId < 1) error(404, 'Event not found');
	const db = getDb();
	requireActor(locals, 'live:view', { eventId, dayId });
	if (!getEvent(db, eventId)) error(404, 'Event not found');
	if (!dayInEvent(db, eventId, dayId)) error(404, 'Day not found');
	return { dayId, snapshot: wireSnapshot(liveSnapshot(db, dayId)) };
};
