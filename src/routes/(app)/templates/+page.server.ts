import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { getDb } from '#lib/server/db/index.js';
import { requireActor } from '#lib/server/guard.js';
import { deleteTemplate, listTemplates } from '#lib/server/templates/index.js';
import { formObject } from '#lib/server/forms.js';

export const load = ({ locals }) => {
	requireActor(locals, 'event:create');
	return { templates: listTemplates(getDb()) };
};

export const actions = {
	delete: async ({ locals, request }) => {
		requireActor(locals, 'event:create');
		const parsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(formObject(await request.formData()));
		if (!parsed.success) return fail(400, { error: 'Template not found' });
		deleteTemplate(getDb(), parsed.data.id);
		return { deleted: true };
	}
};
