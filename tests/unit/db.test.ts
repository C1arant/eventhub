import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../src/lib/server/db/test-db';
import { hashToken, newToken } from '../../src/lib/server/util/tokens';

const TABLES = [
	'users', 'invites', 'sessions', 'login_attempts', 'people', 'events', 'event_days',
	'task_sections', 'tasks', 'assignments', 'assignment_day_calls', 'guest_links',
	'display_tokens', 'ros_items', 'live_state', 'live_log', 'files', 'templates', 'search_index'
];

describe('db', () => {
	const db = createTestDb();
	const client = db.$client;

	it('sets WAL and foreign keys', () => {
		expect(client.pragma('journal_mode', { simple: true })).toBe('wal');
		expect(client.pragma('foreign_keys', { simple: true })).toBe(1);
	});

	it('creates every table', () => {
		const names = client
			.prepare("SELECT name FROM sqlite_master WHERE type='table'")
			.all()
			.map((r) => (r as { name: string }).name);
		for (const t of TABLES) expect(names, t).toContain(t);
	});

	it('supports FTS5 search_index', () => {
		client
			.prepare('INSERT INTO search_index (kind, ref_id, event_id, text) VALUES (?,?,?,?)')
			.run('event', 1, 1, 'Main stage load in');
		const rows = client
			.prepare("SELECT ref_id FROM search_index WHERE search_index MATCH 'stage'")
			.all();
		expect(rows).toHaveLength(1);
	});

	it('tokens are base64url and hash is sha256 hex', () => {
		const t = newToken();
		expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
	});
});
