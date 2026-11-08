import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { can } from '#lib/server/auth/can.js';
import { getDb } from '#lib/server/db/index.js';
import { dispatch, liveSnapshot } from '#lib/server/live/store.js';
import { wireSnapshot } from '#lib/server/live/trim.js';

const actionSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('start') }),
	z.object({ type: z.literal('next') }),
	z.object({ type: z.literal('back') }),
	z.object({ type: z.literal('skip') }),
	z.object({ type: z.literal('hold') }),
	z.object({ type: z.literal('resume') }),
	z.object({ type: z.literal('finish') }),
	z.object({ type: z.literal('insertQuickItem'), title: z.string(), durationSec: z.number() })
]);
const bodySchema = z.object({ action: actionSchema, version: z.number().int().min(0) });

export const POST = async ({ locals, params, request }) => {
	const dayId = Number(params.dayId);
	if (!Number.isInteger(dayId) || dayId < 1) error(404, 'Not found');
	const actor = locals.actor;
	// Only logged-in owner/crew can control; guest/display tokens never can.
	if (actor.kind === 'anon') return json({ message: 'Sign in required' }, { status: 401 });
	const db = getDb();
	if (!can(db, actor, 'live:control', { dayId })) return json({ message: 'Forbidden' }, { status: 403 });

	if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
		return json({ message: 'Content-Type must be application/json' }, { status: 415 });
	}
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json({ message: 'Invalid JSON' }, { status: 400 });
	}
	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) return json({ message: 'Invalid request' }, { status: 400 });

	const r = dispatch(db, dayId, parsed.data.action, parsed.data.version);
	const snapshot = () => wireSnapshot(liveSnapshot(db, dayId));
	if (r.ok) return json({ ok: true, snapshot: snapshot() });
	if (r.reason === 'conflict') return json({ reason: 'conflict', state: r.state, snapshot: snapshot() }, { status: 409 });
	if (r.reason === 'empty') {
		return json({ reason: 'empty', message: 'Add items to the run-of-show before going live' }, { status: 422 });
	}
	return json({ reason: 'invalid', message: 'That action is not available right now', state: r.state }, { status: 422 });
};
