import { getDb } from '#lib/server/db/index.js';
import { dashboard } from '#lib/server/events.js';
import { todayLocal } from '#lib/server/util/dates.js';

export const load = ({ locals }) => {
	const a = locals.actor;
	const date = todayLocal();
	if (a.kind !== 'owner' && a.kind !== 'crew') return { today: [], upcoming: [], myTasks: [], date };
	return { ...dashboard(getDb(), a, date), date };
};
