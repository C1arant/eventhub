import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { getEvent } from '#lib/server/events.js';
import { requireActor } from '#lib/server/guard.js';
import { computeTimes, dayInEvent, DEPARTMENTS, listItems, type Department } from '#lib/server/ros.js';

export const load = ({ locals, params, url }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id < 1) error(404, 'Event not found');
	const db = getDb();
	requireActor(locals, 'ros:view', { eventId: id });
	const event = getEvent(db, id);
	if (!event) error(404, 'Event not found');
	const day = dayInEvent(db, id, Number(params.dayId));
	if (!day) error(404, 'Day not found');
	const raw = url.searchParams.get('dept');
	if (raw !== null && !(DEPARTMENTS as readonly string[]).includes(raw)) error(400, 'Unknown department');
	return {
		eventName: event.name,
		eventId: id,
		day: { id: day.id, label: day.label, date: day.date, startTime: day.startTime },
		dept: raw as Department | null,
		items: computeTimes(day.startTime, listItems(db, day.id))
	};
};
