import { redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { myTasks } from '#lib/server/tasks.js';
import { todayLocal } from '#lib/server/util/dates.js';

export const load = ({ locals }) => {
	const a = locals.actor;
	if (a.kind === 'anon') redirect(303, '/login');
	if (a.kind !== 'owner' && a.kind !== 'crew') return { tasks: [], today: todayLocal() };
	return { tasks: myTasks(getDb(), a.user.id), today: todayLocal() };
};
