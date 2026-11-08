import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { getEvent } from '#lib/server/events.js';
import { requireActor } from '#lib/server/guard.js';
import { report } from '#lib/server/live/store.js';
import { dayInEvent } from '#lib/server/ros.js';

const hhmm = (ms: number) =>
	new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

export const load = ({ locals, params }) => {
	const eventId = Number(params.id);
	const dayId = Number(params.dayId);
	if (!Number.isInteger(eventId) || eventId < 1) error(404, 'Event not found');
	const db = getDb();
	requireActor(locals, 'ros:view', { eventId, dayId });
	if (!getEvent(db, eventId)) error(404, 'Event not found');
	const day = dayInEvent(db, eventId, dayId);
	if (!day) error(404, 'Day not found');
	return {
		day: { id: day.id, label: day.label, date: day.date },
		rows: report(db, dayId).map((r) => ({
			itemId: r.itemId,
			title: r.title,
			plannedStart: hhmm(r.plannedStart),
			actualStart: r.actualStart === null ? null : hhmm(r.actualStart),
			plannedDurSec: r.plannedDurSec,
			actualDurSec: r.actualDurSec,
			diffSec: r.actualDurSec === null ? null : r.actualDurSec - r.plannedDurSec
		}))
	};
};
