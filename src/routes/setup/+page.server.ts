import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { setSessionCookie } from '#lib/server/auth/cookie.js';
import { createSession } from '#lib/server/auth/sessions.js';
import { createOwner, hasOwner, isUniqueViolation } from '#lib/server/auth/users.js';
import { getDb } from '#lib/server/db/index.js';
import { fieldErrors, formObject } from '#lib/server/forms.js';

const schema = z.object({
	name: z.string().trim().min(1, 'Enter your name').max(100),
	email: z.email('Enter a valid email address').max(200),
	password: z.string().min(10, 'Use at least 10 characters').max(200)
});

export const load = () => {
	if (hasOwner(getDb())) redirect(303, '/login');
	return {};
};

export const actions = {
	default: async ({ request, cookies, url }) => {
		const values = formObject(await request.formData());
		const parsed = schema.safeParse(values);
		const keep = { name: values.name ?? '', email: values.email ?? '' };
		if (!parsed.success) return fail(400, { errors: fieldErrors(parsed.error), ...keep });
		const db = getDb();
		let user;
		try {
			user = await createOwner(db, parsed.data);
		} catch (e) {
			if (isUniqueViolation(e))
				return fail(400, { errors: { email: 'That email is already in use' } as Record<string, string>, ...keep });
			if (e instanceof Error && e.message === 'An owner already exists') redirect(303, '/login');
			throw e;
		}
		setSessionCookie(cookies, url, createSession(db, user.id));
		redirect(303, '/');
	}
};
