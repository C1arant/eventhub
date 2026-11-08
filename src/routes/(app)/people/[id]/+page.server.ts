import { error, fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { fieldErrors, formObject } from '#lib/server/forms.js';
import { requireActor } from '#lib/server/guard.js';
import { assignmentCount, deletePerson, getPerson, personInput, updatePerson } from '#lib/server/people.js';

const personId = (p: { id: string }) => {
	const id = Number(p.id);
	if (!Number.isInteger(id) || id < 1) error(404, 'Person not found');
	return id;
};

export const load = ({ locals, params }) => {
	requireActor(locals, 'people:edit');
	const person = getPerson(getDb(), personId(params));
	if (!person) error(404, 'Person not found');
	return { person, eventCount: assignmentCount(getDb(), person.id) };
};

export const actions = {
	update: async ({ locals, params, request }) => {
		requireActor(locals, 'people:edit');
		const id = personId(params);
		if (!getPerson(getDb(), id)) error(404, 'Person not found');
		const values = formObject(await request.formData());
		const parsed = personInput.safeParse(values);
		if (!parsed.success) return fail(400, { errors: fieldErrors(parsed.error), values });
		updatePerson(getDb(), id, parsed.data);
		return { saved: true };
	},
	delete: async ({ locals, params }) => {
		requireActor(locals, 'people:edit');
		const id = personId(params);
		if (!getPerson(getDb(), id)) error(404, 'Person not found');
		deletePerson(getDb(), id);
		redirect(303, '/people');
	}
};
