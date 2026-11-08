import { error } from '@sveltejs/kit';
import { resolveGuestToken } from '#lib/server/auth/guests.js';
import { getDb } from '#lib/server/db/index.js';
import { downloadHeaders, fileWebStream, guestCanDownload } from '#lib/server/files.js';

export const GET = ({ params }) => {
	const db = getDb();
	const actor = resolveGuestToken(db, params.token, Date.now());
	const fileId = Number(params.fileId);
	// One message for every failure: invalid link, someone else's file, unknown file.
	const row = actor && Number.isInteger(fileId) && fileId > 0 ? guestCanDownload(db, actor, fileId) : null;
	if (!row) error(404, 'This link is no longer valid');
	return new Response(fileWebStream(row), { headers: downloadHeaders(row) });
};
