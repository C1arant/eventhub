import { getDb } from '#lib/server/db/index.js';
import { requireUser } from '#lib/server/guard.js';
import { myTasks } from '#lib/server/tasks.js';
import { todayLocal } from '#lib/server/util/dates.js';

export const load = ({ locals }) => {
	const a = requireUser(locals);
	return { tasks: myTasks(getDb(), a.user.id), today: todayLocal() };
};
