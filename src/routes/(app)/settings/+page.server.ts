import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { createInvite, listUsers } from '#lib/server/auth/users.js';
import { getDb } from '#lib/server/db/index.js';
import { fieldErrors, formObject } from '#lib/server/forms.js';
import { requireActor } from '#lib/server/guard.js';

const inviteSchema = z.object({ email: z.email('Enter a valid email address').max(200) });

export const load = ({ locals }) => {
	requireActor(locals, 'settings:manage');
	requireActor(locals, 'users:manage');
	return { users: listUsers(getDb()) };
};

export const actions = {
	invite: async ({ locals, request, url }) => {
		requireActor(locals, 'users:manage');
		const values = formObject(await request.formData());
		const parsed = inviteSchema.safeParse(values);
		if (!parsed.success)
			return fail(400, { errors: fieldErrors(parsed.error), email: values.email ?? '' });
		const token = createInvite(getDb(), { email: parsed.data.email }, Date.now());
		return { inviteLink: `${url.origin}/invite/${token}`, inviteEmail: parsed.data.email };
	}
};
