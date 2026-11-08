import { eq } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { can } from '#lib/server/auth/can.js';
import { revokeGuestLink } from '#lib/server/auth/guests.js';
import { createInvite } from '#lib/server/auth/users.js';
import { getDb, type DB } from '#lib/server/db/index.js';
import { getEvent, listDays } from '#lib/server/events.js';
import { fieldErrors, formObject } from '#lib/server/forms.js';
import { requireActor } from '#lib/server/guard.js';
import {
	assign, assignmentInEvent, callTimeField, createLinkFor, guestLinkInEvent, inviteEligibility, linkLogin, listEventPeople, listGuestLinks, setDayCallTime,
	unassign, updateAssignment
} from '#lib/server/people.js';
import { people } from '#lib/server/db/schema.js';
import { isValidDate, todayLocal } from '#lib/server/util/dates.js';

const eventId = (p: { id: string }) => {
	const id = Number(p.id);
	if (!Number.isInteger(id) || id < 1) error(404, 'Event not found');
	return id;
};
const idOf = (v: unknown) => {
	const n = Number(v);
	return Number.isInteger(n) && n > 0 ? n : 0;
};

export const load = ({ locals, params }) => {
	const id = eventId(params);
	const db = getDb();
	const actor = requireActor(locals, 'people:view', { eventId: id });
	if (!getEvent(db, id)) error(404, 'Event not found');
	const canManage = can(db, actor, 'guest:manage', { eventId: id });
	const assigned = listEventPeople(db, id, { includePrivate: actor.kind === 'owner' });
	const now = Date.now();
	const taken = new Set(assigned.map((a) => a.personId));
	return {
		canManage,
		assigned,
		days: listDays(db, id).map((d) => ({ id: d.id, label: d.label, date: d.date })),
		available: canManage ? db.select({ id: people.id, name: people.name }).from(people).orderBy(people.name).all().filter((p) => !taken.has(p.id)) : [],
		links: canManage
			? listGuestLinks(db, id).map((l) => ({
					...l,
					expiresDate: todayLocal(new Date(l.expiresAt)),
					status: l.revokedAt !== null ? 'revoked' : now >= l.expiresAt ? 'expired' : 'active'
				}))
			: []
	};
};

/** Owner-only mutation: auth + event id. Every other id used afterwards must be checked against the URL's event. */
function begin(locals: App.Locals, params: { id: string }) {
	const id = eventId(params);
	requireActor(locals, 'guest:manage', { eventId: id });
	return { id, db: getDb() };
}

function ownAssignment(db: DB, eid: number, raw: unknown) {
	const a = assignmentInEvent(db, eid, idOf(raw));
	if (!a) error(404, 'Assignment not found');
	return a;
}

const role = z.string().trim().max(100).default('');

const assignSchema = z.object({
	personId: z.coerce.number().int().positive('Choose a person'),
	eventRole: role,
	callTime: callTimeField.default(null)
});
const updateSchema = z.object({
	eventRole: role,
	callTime: callTimeField.default(null),
	isShowCaller: z.preprocess((v) => v === 'on' || v === 'true', z.boolean())
});
const linkSchema = z.object({
	liveAccess: z.preprocess((v) => v === 'on' || v === 'true', z.boolean()),
	contactPersonId: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().positive().nullable()),
	expires: z.preprocess((v) => (v === '' ? undefined : v), z.string().refine(isValidDate, 'Use a valid date').optional())
});

export const actions = {
	assign: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		const parsed = assignSchema.safeParse(values);
		if (!parsed.success) return fail(400, { form: 'assign', errors: fieldErrors(parsed.error), values });
		const exists = db.select({ id: people.id }).from(people).where(eq(people.id, parsed.data.personId)).get();
		if (!exists) return fail(400, { form: 'assign', errors: { personId: 'Person not found' }, values });
		try {
			assign(db, id, parsed.data.personId, { eventRole: parsed.data.eventRole, callTime: parsed.data.callTime });
		} catch {
			return fail(400, { form: 'assign', errors: { personId: 'Already assigned to this event' }, values });
		}
		return { form: 'assign', saved: true };
	},
	update: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		const a = ownAssignment(db, id, values.assignmentId);
		const key = `a${a.id}`;
		const parsed = updateSchema.safeParse(values);
		if (!parsed.success) return fail(400, { form: key, errors: fieldErrors(parsed.error), values });
		// Per-day call times: dayCall_<dayId>; every day must belong to this event.
		const days = listDays(db, id);
		const calls: [number, string | null][] = [];
		for (const d of days) {
			const raw = values[`dayCall_${d.id}`];
			if (raw === undefined) continue;
			const t = callTimeField.safeParse(raw);
			if (!t.success) return fail(400, { form: key, errors: { [`dayCall_${d.id}`]: `${d.label}: use a time like 18:30` }, values });
			calls.push([d.id, t.data]);
		}
		updateAssignment(db, a.id, parsed.data);
		for (const [dayId, t] of calls) setDayCallTime(db, a.id, dayId, t);
		return { form: key, saved: true };
	},
	unassign: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		unassign(db, ownAssignment(db, id, values.assignmentId).id);
		return { form: 'unassign', saved: true };
	},
	createLink: async ({ locals, params, request, url }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		const a = ownAssignment(db, id, values.assignmentId);
		const key = `link${a.id}`;
		const parsed = linkSchema.safeParse(values);
		if (!parsed.success) return fail(400, { form: key, errors: fieldErrors(parsed.error), values });
		const { contactPersonId, expires, liveAccess } = parsed.data;
		const expiresAt = expires ? new Date(`${expires}T23:59:00`).getTime() : undefined;
		if (expiresAt !== undefined && expiresAt <= Date.now()) return fail(400, { form: key, errors: { expires: 'Expiry must be in the future' }, values });
		const r = createLinkFor(db, id, a.id, { liveAccess, contactPersonId, expiresAt });
		if (!r.ok) return fail(400, { form: key, errors: { contactPersonId: r.error }, values });
		return { form: key, newLink: `${url.origin}/g/${r.token}` };
	},
	revokeLink: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		const l = guestLinkInEvent(db, id, idOf(values.linkId));
		if (!l) error(404, 'Link not found');
		revokeGuestLink(db, l.id);
		return { form: 'revoke', saved: true };
	},
	invite: async ({ locals, params, request, url }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		const a = ownAssignment(db, id, values.assignmentId);
		const key = `invite${a.id}`;
		const el = inviteEligibility(db, a.personId);
		if (!el.ok) return fail(400, { form: key, errors: { _form: el.reason }, values });
		if (el.linkUserId !== undefined) {
			if (!linkLogin(db, a.personId, el.linkUserId)) return fail(400, { form: key, errors: { _form: 'A user with this email already exists' }, values });
			return { form: key, linked: true };
		}
		const token = createInvite(db, { email: el.email, personId: a.personId }, Date.now());
		return { form: key, newInvite: `${url.origin}/invite/${token}`, inviteEmail: el.email };
	}
};
