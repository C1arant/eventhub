import { error, fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import {
	addDay, dayInput, deleteDay, deleteEvent, eventInput, getDay, listDays, updateDay, updateEvent
} from '#lib/server/events.js';
import { deleteEventFiles } from '#lib/server/files.js';
import { fieldErrors, formObject } from '#lib/server/forms.js';
import { requireActor } from '#lib/server/guard.js';
import { notifyLive } from '#lib/server/live/store.js';
import { saveAsTemplate, TemplateError } from '#lib/server/templates/index.js';
import { z } from 'zod';

const eid = (p: { id: string }) => Number(p.id);

export const load = ({ locals, params }) => {
	const id = eid(params);
	if (!Number.isInteger(id) || id < 1) error(404, 'Event not found');
	requireActor(locals, 'event:view', { eventId: id });
	return {
		days: listDays(getDb(), id),
		canTemplate: locals.actor.kind === 'owner'
	};
};

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
		deleteEventFiles(getDb(), id);
		deleteEvent(getDb(), id);
		redirect(303, '/events');
	},
	saveTemplate: async ({ locals, params, request }) => {
		requireActor(locals, 'event:create');
		const parsed = z.object({ templateName: z.string().trim().min(1, 'Name is required').max(200) }).safeParse(formObject(await request.formData()));
		if (!parsed.success) return fail(400, { form: 'template', errors: fieldErrors(parsed.error) });
		try {
			saveAsTemplate(getDb(), eid(params), parsed.data.templateName);
		} catch (e) {
			if (e instanceof TemplateError) return fail(404, { form: 'template', errors: { _form: e.message } });
			throw e;
		}
		return { form: 'template', saved: true };
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
		notifyLive(getDb(), dayId); // a changed start time shifts every planned clock
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
