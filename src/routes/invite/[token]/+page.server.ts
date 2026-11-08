import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { setSessionCookie } from '#lib/server/auth/cookie.js';
import { createSession } from '#lib/server/auth/sessions.js';
import { acceptInvite, isUniqueViolation, peekInvite } from '#lib/server/auth/users.js';
import { getDb } from '#lib/server/db/index.js';
import { fieldErrors, formObject } from '#lib/server/forms.js';

const schema = z.object({
	name: z.string().trim().min(1, 'Enter your name').max(100),
	password: z.string().min(10, 'Use at least 10 characters').max(200)
});

export const load = ({ params }) => {
	const inv = peekInvite(getDb(), params.token, Date.now());
	if (!inv) error(404, 'This invite is no longer valid');
	return { email: inv.email };
};

export const actions = {
	default: async ({ request, params, cookies, url }) => {
		const values = formObject(await request.formData());
		const parsed = schema.safeParse(values);
		const keep = { name: values.name ?? '' };
		if (!parsed.success) return fail(400, { errors: fieldErrors(parsed.error), ...keep });
		const db = getDb();
		let user;
		try {
			user = await acceptInvite(db, params.token, parsed.data, Date.now());
		} catch (e) {
			if (isUniqueViolation(e))
				return fail(400, {
					errors: { _form: 'An account with this email already exists. Try logging in instead.' } as Record<string, string>,
					...keep
				});
			if (e instanceof Error && /invite/i.test(e.message)) error(404, 'This invite is no longer valid');
			throw e;
		}
		setSessionCookie(cookies, url, createSession(db, user.id));
		redirect(303, '/');
	}
};
