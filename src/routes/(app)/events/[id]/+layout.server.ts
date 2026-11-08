import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { getEvent } from '#lib/server/events.js';
import { requireActor } from '#lib/server/guard.js';

export const load = ({ locals, params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id < 1) error(404, 'Event not found');
	const actor = requireActor(locals, 'event:view', { eventId: id });
	const event = getEvent(getDb(), id);
	if (!event) error(404, 'Event not found');
	return { event, canEdit: actor.kind === 'owner' };
};
