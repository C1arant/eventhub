import { requireUser } from '#lib/server/guard.js';

export const load = ({ locals }) => {
	const { user } = requireUser(locals);
	return { account: { name: user.name, email: user.email, role: user.role } };
};
