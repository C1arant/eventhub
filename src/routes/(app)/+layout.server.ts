import { redirect } from '@sveltejs/kit';

export const load = ({ locals }) => {
	const a = locals.actor;
	if (a.kind !== 'owner' && a.kind !== 'crew') redirect(303, '/login');
	return { user: { name: a.user.name, email: a.user.email, role: a.user.role } };
};
