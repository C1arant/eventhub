import { redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { randomUUID } from 'node:crypto';
import type { Actor } from '#lib/server/auth/can.js';
import { actorFromSession } from '#lib/server/auth/session-actor.js';
import { hasOwner } from '#lib/server/auth/users.js';
import { getDb } from '#lib/server/db/index.js';

const ANON: Actor = { kind: 'anon' };

function isExempt(path: string): boolean {
	return (
		path === '/healthz' ||
		path.startsWith('/_app/') ||
		path === '/favicon.ico' ||
		path === '/robots.txt'
	);
}

// Later tasks add: actorFromGuestToken (/g/[token]), actorFromDisplayToken, live ?t=.
function resolveActor(event: Parameters<Handle>[0]['event']): Actor {
	return actorFromSession(getDb(), event.cookies, event.url);
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.requestId = randomUUID();
	event.locals.actor = ANON;
	const path = event.url.pathname;

	if (!isExempt(path)) {
		const db = getDb();
		if (!hasOwner(db)) {
			if (path !== '/setup') redirect(303, '/setup');
		} else {
			if (path === '/setup') redirect(303, '/login');
			event.locals.actor = resolveActor(event);
		}
	}

	const response = await resolve(event);
	response.headers.set('x-request-id', event.locals.requestId);
	return response;
};

export const handleError: HandleServerError = ({ kind, error, event }) => {
	const requestId = event.locals?.requestId ?? randomUUID();
	if (kind === 'unknown') {
		console.error(JSON.stringify({ requestId, path: event.url.pathname, error: String(error) }), error);
		return { message: 'Something went wrong', requestId };
	}
	// app/framework errors (404, 403, ...) keep their own message
	return { requestId };
};
