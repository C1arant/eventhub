import { getDb } from '#lib/server/db/index.js';
import { requireActor } from '#lib/server/guard.js';
import { listUsers } from '#lib/server/auth/users.js';

export const load = ({ locals }) => {
	requireActor(locals, 'settings:manage');
	requireActor(locals, 'users:manage');
	return { users: listUsers(getDb()) };
};
