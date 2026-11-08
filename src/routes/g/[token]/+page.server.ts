import { error } from '@sveltejs/kit';
import { resolveGuestToken } from '#lib/server/auth/guests.js';
import { getDb } from '#lib/server/db/index.js';
import { guestView } from '#lib/server/guest-view.js';

export const load = ({ params, setHeaders }) => {
	const db = getDb();
	const actor = resolveGuestToken(db, params.token, Date.now());
	// One message for unknown, expired, revoked and removed: reveal nothing.
	if (!actor) error(404, 'This link is no longer valid');
	setHeaders({ 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
	return { token: params.token, view: guestView(db, actor, params.token) };
};
