import { getDb } from '#lib/server/db/index.js';
import { listEventsFor } from '#lib/server/events.js';

export const load = ({ locals }) => {
	const a = locals.actor;
	return {
		events: a.kind === 'owner' || a.kind === 'crew' ? listEventsFor(getDb(), a) : [],
		canCreate: a.kind === 'owner'
	};
};
