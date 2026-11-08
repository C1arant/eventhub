import { redirect } from '@sveltejs/kit';
import { clearSessionCookie, SESSION_COOKIE } from '#lib/server/auth/cookie.js';
import { deleteAllSessions, deleteSession } from '#lib/server/auth/sessions.js';
import { getDb } from '#lib/server/db/index.js';

export const load = () => redirect(303, '/');

export const actions = {
	logout: ({ cookies, url }) => {
		const token = cookies.get(SESSION_COOKIE);
		if (token) deleteSession(getDb(), token);
		clearSessionCookie(cookies, url);
		redirect(303, '/login');
	},
	everywhere: ({ cookies, url, locals }) => {
		const a = locals.actor;
		if (a.kind === 'owner' || a.kind === 'crew') deleteAllSessions(getDb(), a.user.id);
		clearSessionCookie(cookies, url);
		redirect(303, '/login');
	}
};
