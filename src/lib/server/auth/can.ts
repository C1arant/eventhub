import { and, eq } from 'drizzle-orm';
import type { DB } from '../db';
import { assignments, eventDays } from '../db/schema';
import type { User } from './users';

export type Actor =
	| { kind: 'owner'; user: User }
	| { kind: 'crew'; user: User }
	| {
			kind: 'guest';
			assignmentId: number;
			eventId: number;
			personId: number;
			liveAccess: boolean;
	  }
	| { kind: 'display'; eventId: number }
	| { kind: 'anon' };

export type GuestActor = Extract<Actor, { kind: 'guest' }>;
export type DisplayActor = Extract<Actor, { kind: 'display' }>;

export type Action =
	| 'event:view'
	| 'event:edit'
	| 'event:create'
	| 'tasks:edit'
	| 'people:view'
	| 'people:edit'
	| 'callsheet:view'
	| 'ros:view'
	| 'ros:edit'
	| 'live:view'
	| 'live:control'
	| 'files:upload'
	| 'guest:manage'
	| 'users:manage'
	| 'settings:manage';

export type Resource = { eventId?: number; dayId?: number };

const CREW_ASSIGNED: ReadonlySet<Action> = new Set<Action>([
	'event:view',
	'tasks:edit',
	'people:view',
	'callsheet:view',
	'ros:view',
	'ros:edit',
	'live:view',
	'files:upload'
]);

/** Resolve the event a resource refers to; null if missing or unknown. */
function resolveEventId(db: DB, resource?: Resource): number | null {
	if (!resource) return null;
	if (resource.dayId !== undefined) {
		const day = db
			.select({ eventId: eventDays.eventId })
			.from(eventDays)
			.where(eq(eventDays.id, resource.dayId))
			.get();
		if (!day) return null;
		// If both are given they must agree.
		if (resource.eventId !== undefined && resource.eventId !== day.eventId) return null;
		return day.eventId;
	}
	return resource.eventId ?? null;
}

export function can(db: DB, actor: Actor, action: Action, resource?: Resource): boolean {
	switch (actor.kind) {
		case 'owner':
			return true;
		case 'crew': {
			const personId = actor.user.personId;
			if (personId === null || actor.user.role !== 'crew') return false;
			const isCaller = action === 'live:control';
			if (!isCaller && !CREW_ASSIGNED.has(action)) return false;
			const eventId = resolveEventId(db, resource);
			if (eventId === null) return false;
			const a = db
				.select({ isShowCaller: assignments.isShowCaller })
				.from(assignments)
				.where(and(eq(assignments.eventId, eventId), eq(assignments.personId, personId)))
				.get();
			if (!a) return false;
			return isCaller ? a.isShowCaller : true;
		}
		case 'guest': {
			// Guest page data is served by a dedicated loader, not via these actions.
			if (action !== 'live:view' || !actor.liveAccess) return false;
			const eventId = resolveEventId(db, resource);
			return eventId !== null && eventId === actor.eventId;
		}
		case 'display': {
			if (action !== 'live:view') return false;
			const eventId = resolveEventId(db, resource);
			return eventId !== null && eventId === actor.eventId;
		}
		default:
			return false;
	}
}
