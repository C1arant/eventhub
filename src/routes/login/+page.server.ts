import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { setSessionCookie } from '#lib/server/auth/cookie.js';
import { hashPassword, verifyPassword } from '#lib/server/auth/password.js';
import { checkLimit, recordFailure, recordSuccess } from '#lib/server/auth/ratelimit.js';
import { createSession } from '#lib/server/auth/sessions.js';
import { getPasswordHashForEmail, getUserByEmail } from '#lib/server/auth/users.js';
import { getDb } from '#lib/server/db/index.js';
import { fieldErrors, formObject } from '#lib/server/forms.js';

const schema = z.object({
	email: z.string().trim().min(1, 'Enter your email').max(200),
	password: z.string().min(1, 'Enter your password').max(200)
});

// Verified against when the email is unknown so timing does not reveal existence.
const dummyHash = hashPassword('dummy-password-for-timing');

export const load = ({ locals }) => {
	if (locals.actor.kind === 'owner' || locals.actor.kind === 'crew') redirect(303, '/');
	return {};
};

export const actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const values = formObject(await request.formData());
		const parsed = schema.safeParse(values);
		const keep = { email: values.email ?? '' };
		if (!parsed.success) return fail(400, { errors: fieldErrors(parsed.error), ...keep });
		const { password } = parsed.data;
		const email = parsed.data.email.toLowerCase();
		const db = getDb();
		const now = Date.now();

		let addr = 'unknown';
		try {
			addr = getClientAddress();
		} catch {
			/* address unavailable; fall back to a shared key */
		}
		const keys = [`ip:${addr}`, `email:${email}`];

		const locked = keys.map((k) => checkLimit(db, k, now)).filter((c) => !c.allowed);
		if (locked.length) {
			const secs = Math.max(...locked.map((c) => c.retryAfterSec));
			return fail(429, { message: `Too many attempts, try again in ${secs} seconds`, ...keep });
		}

		const hash = getPasswordHashForEmail(db, email);
		let ok = false;
		if (hash) ok = await verifyPassword(hash, password);
		else await verifyPassword(await dummyHash, password);

		const user = ok ? getUserByEmail(db, email) : null;
		if (!user) {
			for (const k of keys) recordFailure(db, k, now);
			return fail(400, { message: 'Incorrect email or password', ...keep });
		}
		for (const k of keys) recordSuccess(db, k);
		setSessionCookie(cookies, url, createSession(db, user.id));
		redirect(303, '/');
	}
};
