import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { requireActor } from '#lib/server/guard.js';
import { downloadHeaders, fileWebStream, getFile } from '#lib/server/files.js';

export const GET = ({ locals, params }) => {
	const db = getDb();
	const fileId = Number(params.fileId);
	const row = Number.isInteger(fileId) && fileId > 0 ? getFile(db, fileId) : undefined;
	if (!row) error(404, 'File not found');
	requireActor(locals, 'event:view', { eventId: row.eventId });
	return new Response(fileWebStream(row), { headers: downloadHeaders(row) });
};
