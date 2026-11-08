import { error } from '@sveltejs/kit';
import { SESSION_COOKIE } from '#lib/server/auth/cookie.js';
import { can } from '#lib/server/auth/can.js';
import { getDb } from '#lib/server/db/index.js';
import { subscribe } from '#lib/server/live/hub.js';
import { stillAllowed } from '#lib/server/live/stream-auth.js';
import { liveSnapshot, type LiveSnapshot } from '#lib/server/live/store.js';
import { wireSnapshot } from '#lib/server/live/trim.js';

const HEARTBEAT_MS = 15_000;

export const GET = ({ locals, params, url, cookies, request }) => {
	const dayId = Number(params.dayId);
	if (!Number.isInteger(dayId) || dayId < 1) error(404, 'Not found');
	const db = getDb();
	// Never reveal whether the day exists to someone who may not view it.
	if (!can(db, locals.actor, 'live:view', { dayId })) error(404, 'Not found');

	const creds = { session: cookies.get(SESSION_COOKIE), token: url.searchParams.get('t') };
	const enc = new TextEncoder();
	let cleanup = () => {};

	const body = new ReadableStream({
		start(controller) {
			let done = false;
			let unsub = () => {};
			let timer: ReturnType<typeof setInterval> | undefined;
			const close = () => {
				if (done) return;
				done = true;
				unsub();
				if (timer) clearInterval(timer);
				try {
					controller.close();
				} catch {
					/* already closed */
				}
			};
			cleanup = close;
			const write = (s: string) => {
				if (done) return;
				try {
					controller.enqueue(enc.encode(s));
				} catch {
					close();
				}
			};
			const sendState = (snap: LiveSnapshot) =>
				write(`event: state\ndata: ${JSON.stringify(wireSnapshot(snap))}\n\n`);

			// Subscribe before the initial snapshot so no publish is missed in between.
			unsub = subscribe(dayId, (data) => sendState(JSON.parse(data)));
			write('retry: 1000\n\n');
			sendState(liveSnapshot(db, dayId));
			timer = setInterval(() => {
				if (!stillAllowed(db, creds, dayId, Date.now())) return close();
				write(': ping\n\n');
			}, HEARTBEAT_MS);
			request.signal.addEventListener('abort', close);
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(body, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
