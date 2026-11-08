import { error, redirect } from '@sveltejs/kit';
import { can, type Action, type Actor, type Resource } from './auth/can';
import { getDb, type DB } from './db';

/**
 * Authorize the current actor for an action. Returns the actor on success.
 * anon -> redirect to /login; guest/display -> 404 (never reveal anything);
 * logged-in but forbidden -> 403.
 */
export function requireActor(
	locals: { actor: Actor },
	action: Action,
	resource?: Resource,
	db: DB = getDb()
): Actor {
	const actor = locals.actor;
	if (actor.kind === 'anon') redirect(303, '/login');
	if (can(db, actor, action, resource)) return actor;
	if (actor.kind === 'guest' || actor.kind === 'display') error(404, 'Link no longer valid');
	error(403, 'You do not have permission to do that');
}

/** Any logged-in owner/crew user (for global pages). anon -> /login; guest/display -> 404. */
export function requireUser(locals: { actor: Actor }): Extract<Actor, { kind: 'owner' | 'crew' }> {
	const a = locals.actor;
	if (a.kind === 'anon') redirect(303, '/login');
	if (a.kind !== 'owner' && a.kind !== 'crew') error(404, 'Link no longer valid');
	return a;
}
