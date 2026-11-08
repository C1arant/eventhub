import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { createEvent, eventInput } from '#lib/server/events.js';
import { fieldErrors, formObject } from '#lib/server/forms.js';
import { requireActor } from '#lib/server/guard.js';

export const load = ({ locals }) => {
	requireActor(locals, 'event:create');
	return {};
};

export const actions = {
	default: async ({ locals, request }) => {
		requireActor(locals, 'event:create');
		const values = formObject(await request.formData());
		const parsed = eventInput.safeParse(values);
		if (!parsed.success) return fail(400, { errors: fieldErrors(parsed.error), values });
		const id = createEvent(getDb(), parsed.data);
		redirect(303, `/events/${id}`);
	}
};
