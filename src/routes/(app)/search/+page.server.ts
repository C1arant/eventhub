import { z } from 'zod';
import { getDb } from '#lib/server/db/index.js';
import { requireUser } from '#lib/server/guard.js';
import { search } from '#lib/server/search.js';

export const load = ({ locals, url }) => {
	const actor = requireUser(locals);
	const q = z.string().max(200).catch('').parse(url.searchParams.get('q') ?? '').trim();
	const results = search(getDb(), actor, q);
	const href = (r: (typeof results)[number]): string | null => {
		if (r.kind === 'event') return `/events/${r.refId}`;
		if (r.kind === 'task') return `/events/${r.eventId}/tasks`;
		if (actor.kind === 'owner') return `/people/${r.refId}`;
		return r.eventId === null ? null : `/events/${r.eventId}/people`;
	};
	return { q, results: results.map((r) => ({ ...r, href: href(r) })) };
};
