import { eq } from 'drizzle-orm';
import type { Actor } from './auth/can';
import type { DB } from './db';
import { assignments, events, people, tasks } from './db/schema';

export type DocKind = 'event' | 'person' | 'task';

export type SearchResult = {
	kind: DocKind;
	refId: number;
	eventId: number | null;
	title: string;
	/** Text with \u0002 / \u0003 around matches. Render as text, never as HTML. */
	snippet: string;
};

export const MARK_START = '\u0002';
export const MARK_END = '\u0003';
const MAX_RESULTS = 30;
const RAW_LIMIT = 500;

export function indexDoc(db: DB, kind: DocKind, refId: number, eventId: number | null, text: string): void {
	db.$client.transaction(() => {
		db.$client.prepare('DELETE FROM search_index WHERE kind = ? AND ref_id = ?').run(kind, refId);
		db.$client.prepare('INSERT INTO search_index (kind, ref_id, event_id, text) VALUES (?, ?, ?, ?)').run(kind, refId, eventId, text);
	})();
}

export function removeDoc(db: DB, kind: DocKind, refId: number): void {
	db.$client.prepare('DELETE FROM search_index WHERE kind = ? AND ref_id = ?').run(kind, refId);
}

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' ');

function parseTags(raw: string): string[] {
	try {
		const v = JSON.parse(raw);
		return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

/** Clear and re-index every event, task and person in one transaction. */
export function rebuildSearchIndex(db: DB): void {
	db.$client.transaction(() => {
		db.$client.exec('DELETE FROM search_index');
		for (const e of db.select().from(events).all())
			indexDoc(db, 'event', e.id, e.id, join(e.name, e.venue, e.address, e.notes));
		for (const t of db.select().from(tasks).all()) indexDoc(db, 'task', t.id, t.eventId, join(t.title, t.notes));
		for (const p of db.select().from(people).all())
			indexDoc(db, 'person', p.id, null, join(p.name, parseTags(p.tags).join(' ')));
	})();
}

/** Quote each term and prefix-match it; terms are ANDed. Empty input gives null. */
export function sanitizeQuery(q: string): string | null {
	const terms = q.split(/\s+/).map((t) => t.replaceAll('"', '')).filter(Boolean);
	if (terms.length === 0) return null;
	return terms.map((t) => `"${t}"*`).join(' ');
}

const today = () => new Date().toLocaleDateString('en-CA');

export function search(db: DB, actor: Actor, q: string): SearchResult[] {
	if (actor.kind !== 'owner' && actor.kind !== 'crew') return [];
	const match = sanitizeQuery(q);
	if (!match) return [];

	// Crew scope: events they are assigned to, and people on those events.
	let myEvents: Set<number> | null = null;
	let shared: Map<number, number> | null = null; // personId -> best shared eventId
	if (actor.kind === 'crew') {
		const personId = actor.user.personId;
		if (personId === null) return [];
		const mine = db
			.select({ id: events.id, start: events.startDate })
			.from(assignments)
			.innerJoin(events, eq(events.id, assignments.eventId))
			.where(eq(assignments.personId, personId))
			.all();
		myEvents = new Set(mine.map((m) => m.id));
		if (myEvents.size === 0) return [];
		const startOf = new Map(mine.map((m) => [m.id, m.start]));
		const now = today();
		const better = (a: number, b: number) => {
			const sa = startOf.get(a)!, sb = startOf.get(b)!;
			const ua = sa >= now, ub = sb >= now;
			if (ua !== ub) return ua; // upcoming beats past
			return ua ? sa < sb : sa > sb; // soonest upcoming / most recent past
		};
		shared = new Map();
		for (const row of db.select({ personId: assignments.personId, eventId: assignments.eventId }).from(assignments).all()) {
			if (!myEvents.has(row.eventId)) continue;
			const cur = shared.get(row.personId);
			if (cur === undefined || better(row.eventId, cur)) shared.set(row.personId, row.eventId);
		}
	}

	const raw = db.$client
		.prepare(
			`SELECT kind, ref_id AS refId, event_id AS eventId,
			        snippet(search_index, 3, ?, ?, '…', 12) AS snippet
			 FROM search_index WHERE search_index MATCH ? ORDER BY rank LIMIT ?`
		)
		.all(MARK_START, MARK_END, match, RAW_LIMIT) as { kind: DocKind; refId: number; eventId: number | null; snippet: string }[];

	const out: SearchResult[] = [];
	for (const r of raw) {
		if (out.length >= MAX_RESULTS) break;
		let title: string | undefined;
		let eventId = r.eventId;
		if (r.kind === 'event') {
			if (myEvents && !myEvents.has(r.refId)) continue;
			title = db.select({ n: events.name }).from(events).where(eq(events.id, r.refId)).get()?.n;
		} else if (r.kind === 'task') {
			const t = db.select({ t: tasks.title, e: tasks.eventId }).from(tasks).where(eq(tasks.id, r.refId)).get();
			if (!t || (myEvents && !myEvents.has(t.e))) continue;
			title = t.t;
			eventId = t.e;
		} else {
			if (shared) {
				const ev = shared.get(r.refId);
				if (ev === undefined) continue;
				eventId = ev;
			} else {
				eventId = null;
			}
			title = db.select({ n: people.name }).from(people).where(eq(people.id, r.refId)).get()?.n;
		}
		if (title === undefined) continue; // stale index row
		out.push({ kind: r.kind, refId: r.refId, eventId, title, snippet: r.snippet });
	}
	return out;
}
