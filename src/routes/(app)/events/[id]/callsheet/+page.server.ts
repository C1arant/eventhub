import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { getEvent } from '#lib/server/events.js';
import { requireActor } from '#lib/server/guard.js';
import { callSheet } from '#lib/server/people.js';

export const load = ({ locals, params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id < 1) error(404, 'Event not found');
	const actor = requireActor(locals, 'callsheet:view', { eventId: id });
	const db = getDb();
	const event = getEvent(db, id);
	if (!event) error(404, 'Event not found');
	return { rows: callSheet(db, id, { includePrivate: actor.kind === 'owner' }), venue: event.venue, address: event.address };
};
