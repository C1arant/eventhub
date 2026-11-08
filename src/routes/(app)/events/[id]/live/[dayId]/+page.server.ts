import { error, fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { can } from '#lib/server/auth/can.js';
import { createDisplayToken, listDisplayTokens, revokeDisplayToken } from '#lib/server/auth/guests.js';
import { getDb } from '#lib/server/db/index.js';
import { displayTokens } from '#lib/server/db/schema.js';
import { getEvent } from '#lib/server/events.js';
import { requireActor } from '#lib/server/guard.js';
import { liveSnapshot } from '#lib/server/live/store.js';
import { wireSnapshot } from '#lib/server/live/trim.js';
import { dayInEvent } from '#lib/server/ros.js';

function ctx(locals: App.Locals, params: { id: string; dayId: string }, action: 'live:view' | 'guest:manage') {
	const eventId = Number(params.id);
	const dayId = Number(params.dayId);
	if (!Number.isInteger(eventId) || eventId < 1) error(404, 'Event not found');
	const db = getDb();
	const actor = requireActor(locals, action, { eventId, dayId });
	if (!getEvent(db, eventId)) error(404, 'Event not found');
	const day = dayInEvent(db, eventId, dayId);
	if (!day) error(404, 'Day not found');
	return { db, actor, eventId, day };
}

export const load = ({ locals, params }) => {
	const { db, actor, eventId, day } = ctx(locals, params, 'live:view');
	const owner = actor.kind === 'owner';
	return {
		day: { id: day.id, label: day.label, date: day.date, startTime: day.startTime },
		canControl: can(db, actor, 'live:control', { dayId: day.id }),
		isOwner: owner,
		snapshot: wireSnapshot(liveSnapshot(db, day.id)),
		displayTokens: owner ? listDisplayTokens(db, eventId) : []
	};
};

export const actions = {
	createDisplay: ({ locals, params, url }) => {
		const { db, eventId, day } = ctx(locals, params, 'guest:manage');
		const token = createDisplayToken(db, eventId);
		return { displayUrl: `${url.origin}/display/${token}/${day.id}` };
	},
	revokeDisplay: async ({ locals, params, request }) => {
		const { db, eventId } = ctx(locals, params, 'guest:manage');
		const id = Number((await request.formData()).get('id'));
		if (!Number.isInteger(id) || id < 1) return fail(400, { message: 'Invalid token' });
		// The token must belong to this event.
		const row = db
			.select({ id: displayTokens.id })
			.from(displayTokens)
			.where(and(eq(displayTokens.id, id), eq(displayTokens.eventId, eventId)))
			.get();
		if (!row) return fail(404, { message: 'Token not found' });
		revokeDisplayToken(db, id);
		return { revoked: true };
	}
};
