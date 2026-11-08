import { redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { randomUUID } from 'node:crypto';
import type { Actor } from '#lib/server/auth/can.js';
import { actorFromCredentials } from '#lib/server/live/stream-auth.js';
import { actorFromSession } from '#lib/server/auth/session-actor.js';
import { hasOwner } from '#lib/server/auth/users.js';
import { getDb } from '#lib/server/db/index.js';
import { sweepOrphanUploads } from '#lib/server/files.js';
import { seedStarters } from '#lib/server/templates/starters.js';

// Runs once per server process, before the first request.
export const init: ServerInit = () => {
	seedStarters(getDb());
	sweepOrphanUploads(getDb());
};

const ANON: Actor = { kind: 'anon' };

function isExempt(path: string): boolean {
	return (
		path === '/healthz' ||
		path.startsWith('/_app/') ||
		path === '/favicon.ico' ||
		path === '/robots.txt'
	);
}

// Later tasks add: actorFromGuestToken (/g/[token]).
function resolveActor(event: Parameters<Handle>[0]['event']): Actor {
	const db = getDb();
	const actor = actorFromSession(db, event.cookies, event.url);
	// Guest/display tokens are accepted via ?t= on /live/* only, and only when there is no session actor.
	if (actor.kind === 'anon' && event.url.pathname.startsWith('/live/')) {
		const t = event.url.searchParams.get('t');
		if (t) return actorFromCredentials(db, { token: t }, Date.now());
	}
	return actor;
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
	applyTokenPathHeaders(path, response.headers);
	return response;
};

/** Capability-token pages: never leak the URL via Referer, never cache. */
export function applyTokenPathHeaders(path: string, headers: Headers): void {
	if (path.startsWith('/g/') || path.startsWith('/display/')) {
		headers.set('Referrer-Policy', 'no-referrer');
		headers.set('Cache-Control', 'no-store');
	}
}

/** Never log capability tokens that live in the path. */
export function redactPath(path: string): string {
	return path.replace(/^\/(display|g)\/[^/]+/, '/$1/[redacted]');
}

export const handleError: HandleServerError = ({ kind, error, event }) => {
	const requestId = event.locals?.requestId ?? randomUUID();
	if (kind === 'unknown') {
		console.error(JSON.stringify({ requestId, path: redactPath(event.url.pathname), error: String(error) }), error);
		return { message: 'Something went wrong', requestId };
	}
	// app/framework errors (404, 403, ...) keep their own message
	return { requestId };
};
