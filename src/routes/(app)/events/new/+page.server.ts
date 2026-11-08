import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { createEvent, eventInput } from '#lib/server/events.js';
import { fieldErrors, formObject } from '#lib/server/forms.js';
import { requireActor } from '#lib/server/guard.js';
import { instantiateInput, instantiateTemplate, listTemplates, TemplateError } from '#lib/server/templates/index.js';

export const load = ({ locals }) => {
	requireActor(locals, 'event:create');
	return { templates: listTemplates(getDb()).filter((t) => !t.broken) };
};

export const actions = {
	create: async ({ locals, request }) => {
		requireActor(locals, 'event:create');
		const values = formObject(await request.formData());
		const parsed = eventInput.safeParse(values);
		if (!parsed.success) return fail(400, { errors: fieldErrors(parsed.error), values });
		const id = createEvent(getDb(), parsed.data);
		redirect(303, `/events/${id}`);
	},
	fromTemplate: async ({ locals, request }) => {
		requireActor(locals, 'event:create');
		const values = formObject(await request.formData());
		const parsed = instantiateInput.safeParse(values);
		if (!parsed.success) return fail(400, { tplErrors: fieldErrors(parsed.error), tplValues: values });
		let id: number;
		try {
			id = instantiateTemplate(getDb(), parsed.data.templateId, parsed.data);
		} catch (e) {
			if (e instanceof TemplateError) return fail(400, { tplErrors: { _form: e.message }, tplValues: values });
			throw e;
		}
		redirect(303, `/events/${id}`);
	}
};
