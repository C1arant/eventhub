import { error } from '@sveltejs/kit';
import { can } from '#lib/server/auth/can.js';
import { getDb } from '#lib/server/db/index.js';
import { downloadHeaders, getFile, openDownload } from '#lib/server/files.js';
import { requireUser } from '#lib/server/guard.js';

export const GET = async ({ locals, params }) => {
	const db = getDb();
	// Authenticate before touching the file table: anon -> /login, guest/display -> 404.
	const actor = requireUser(locals);
	const fileId = Number(params.fileId);
	const row = Number.isInteger(fileId) && fileId > 0 ? getFile(db, fileId) : undefined;
	// Unknown file and "no access" look identical.
	if (!row || !can(db, actor, 'event:view', { eventId: row.eventId })) error(404, 'File not found');
	const body = await openDownload(row);
	if (!body) error(404, 'File not found');
	return new Response(body, { headers: downloadHeaders(row) });
};
