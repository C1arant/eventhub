import { error } from '@sveltejs/kit';
import { resolveGuestToken } from '#lib/server/auth/guests.js';
import { getDb } from '#lib/server/db/index.js';
import { downloadHeaders, guestCanDownload, openDownload } from '#lib/server/files.js';

export const GET = async ({ params }) => {
	const db = getDb();
	const actor = resolveGuestToken(db, params.token, Date.now());
	const fileId = Number(params.fileId);
	// One message for every failure: invalid link, someone else's file, unknown file.
	const row = actor && Number.isInteger(fileId) && fileId > 0 ? guestCanDownload(db, actor, fileId) : null;
	const body = row ? await openDownload(row) : null;
	if (!row || !body) error(404, 'This link is no longer valid');
	return new Response(body, { headers: downloadHeaders(row) });
};
