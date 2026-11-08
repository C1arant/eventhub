import { error } from '@sveltejs/kit';
import { can } from '#lib/server/auth/can.js';
import { getDb } from '#lib/server/db/index.js';
import { getDay } from '#lib/server/ros.js';

/** 200 while the caller may still view this day's live state, 404 otherwise. */
export const GET = ({ locals, params }) => {
	const dayId = Number(params.dayId);
	if (!Number.isInteger(dayId) || dayId < 1) error(404, 'Not found');
	const db = getDb();
	if (!getDay(db, dayId) || !can(db, locals.actor, 'live:view', { dayId })) error(404, 'Not found');
	return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
};
