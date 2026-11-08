import { getDb } from '#lib/server/db/index.js';

// Liveness/readiness probe: reachable before owner setup (hooks exempt it), never cached.
export const GET = () => {
	getDb().$client.prepare('SELECT 1').get();
	return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
};
