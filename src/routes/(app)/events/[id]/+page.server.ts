import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import {
	addDay, dayInput, deleteDay, deleteEvent, eventInput, getDay, listDays, updateDay, updateEvent
} from '#lib/server/events.js';
import { fieldErrors, formObject } from '#lib/server/forms.js';
import { requireActor } from '#lib/server/guard.js';

const eid = (p: { id: string }) => Number(p.id);

export const load = ({ params }) => ({ days: listDays(getDb(), eid(params)) });

export const actions = {
	update: async ({ locals, params, request }) => {
		const id = eid(params);
		requireActor(locals, 'event:edit', { eventId: id });
		const values = formObject(await request.formData());
		const parsed = eventInput.safeParse(values);
		if (!parsed.success) return fail(400, { form: 'event', errors: fieldErrors(parsed.error), values });
		updateEvent(getDb(), id, parsed.data);
		return { form: 'event', saved: true };
	},
	delete: async ({ locals, params }) => {
		const id = eid(params);
		requireActor(locals, 'event:edit', { eventId: id });
		deleteEvent(getDb(), id);
		redirect(303, '/events');
	},
	addDay: async ({ locals, params, request }) => {
		const id = eid(params);
		requireActor(locals, 'event:edit', { eventId: id });
		const values = formObject(await request.formData());
		const parsed = dayInput.safeParse(values);
		if (!parsed.success) return fail(400, { form: 'addDay', errors: fieldErrors(parsed.error), values });
		addDay(getDb(), id, parsed.data);
		return { form: 'addDay', saved: true };
	},
	updateDay: async ({ locals, params, request }) => {
		const id = eid(params);
		requireActor(locals, 'event:edit', { eventId: id });
		const values = formObject(await request.formData());
		const dayId = Number(values.dayId);
		const day = getDay(getDb(), dayId);
		if (!day || day.eventId !== id) return fail(404, { form: `day${dayId}`, errors: { _form: 'Day not found' }, values });
		const parsed = dayInput.safeParse(values);
		if (!parsed.success) return fail(400, { form: `day${dayId}`, errors: fieldErrors(parsed.error), values });
		updateDay(getDb(), dayId, parsed.data);
		return { form: `day${dayId}`, saved: true };
	},
	deleteDay: async ({ locals, params, request }) => {
		const id = eid(params);
		requireActor(locals, 'event:edit', { eventId: id });
		const values = formObject(await request.formData());
		const dayId = Number(values.dayId);
		const day = getDay(getDb(), dayId);
		if (!day || day.eventId !== id) return fail(404, { form: `day${dayId}`, errors: { _form: 'Day not found' }, values });
		const r = deleteDay(getDb(), dayId);
		if (!r.ok) return fail(400, { form: `day${dayId}`, errors: { _form: r.error }, values });
		return { form: `day${dayId}`, saved: true };
	}
};
