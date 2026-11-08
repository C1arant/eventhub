import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { getEvent, listDays } from '#lib/server/events.js';
import { requireActor } from '#lib/server/guard.js';
import { can } from '#lib/server/auth/can.js';
import { getLive } from '#lib/server/live/store.js';

export const load = ({ locals, params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id < 1) error(404, 'Event not found');
	const actor = requireActor(locals, 'live:view', { eventId: id });
	const db = getDb();
	if (!getEvent(db, id)) error(404, 'Event not found');
	return {
		days: listDays(db, id).map((d) => ({
			id: d.id,
			label: d.label,
			date: d.date,
			startTime: d.startTime,
			status: getLive(db, d.id).status,
			canControl: can(db, actor, 'live:control', { dayId: d.id })
		}))
	};
};
