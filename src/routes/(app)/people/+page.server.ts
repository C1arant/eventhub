import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { fieldErrors, formObject } from '#lib/server/forms.js';
import { requireActor } from '#lib/server/guard.js';
import { createPerson, listPeople, personInput } from '#lib/server/people.js';

export const load = ({ locals, url }) => {
	requireActor(locals, 'people:edit');
	const q = url.searchParams.get('q') ?? '';
	const tag = url.searchParams.get('tag') ?? '';
	const all = listPeople(getDb(), {});
	const tags = [...new Set(all.flatMap((p) => p.tags))].sort();
	return { people: listPeople(getDb(), { q, tag }), tags, q, tag };
};

export const actions = {
	create: async ({ locals, request }) => {
		requireActor(locals, 'people:edit');
		const values = formObject(await request.formData());
		const parsed = personInput.safeParse(values);
		if (!parsed.success) return fail(400, { errors: fieldErrors(parsed.error), values });
		const id = createPerson(getDb(), parsed.data);
		redirect(303, `/people/${id}`);
	}
};
