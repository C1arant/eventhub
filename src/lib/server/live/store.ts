import { asc, eq } from 'drizzle-orm';
import type { DB } from '../db/index.js';
import { eventDays, liveLog, liveState, rosItems } from '../db/schema.js';
import { computeTimes, deleteItem, getItem, type TimedItem } from '../ros.js';
import { publish } from './hub.js';
import { applyAction, type LiveAction, type LiveState } from './machine.js';

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
type Conn = DB | Tx;

export type DispatchResult =
	| { ok: true; state: LiveState }
	| { ok: false; reason: 'conflict' | 'empty' | 'invalid'; state: LiveState };

export type LiveSnapshot = {
	state: LiveState;
	now: TimedItem | null;
	next: TimedItem | null;
	after: TimedItem | null;
	/** Seconds left on the current item (negative once it overruns); frozen while held; null when idle/finished. */
	remainingSec: number | null;
	/** Positive = running late. */
	overUnderSec: number;
};

const IDLE = (): LiveState => ({ status: 'idle', currentItemId: null, currentStartedAt: null, heldAt: null, version: 0 });

function readState(c: Conn, dayId: number): LiveState {
	const r = c.select().from(liveState).where(eq(liveState.dayId, dayId)).get();
	if (!r) return IDLE();
	return { status: r.status, currentItemId: r.currentItemId, currentStartedAt: r.currentStartedAt, heldAt: r.heldAt, version: r.version };
}

function saveState(c: Conn, dayId: number, s: LiveState) {
	c.insert(liveState).values({ dayId, ...s }).onConflictDoUpdate({ target: liveState.dayId, set: { ...s } }).run();
}

function itemRows(c: Conn, dayId: number) {
	return c.select().from(rosItems).where(eq(rosItems.dayId, dayId)).orderBy(asc(rosItems.position), asc(rosItems.id)).all();
}

function log(c: Conn, dayId: number, action: string, itemId: number | null, at: number) {
	c.insert(liveLog).values({ dayId, action, itemId, at }).run();
}

/** Post-commit broadcast; a failure here must not make a committed change look failed. */
function safePublish(db: DB, dayId: number, now: number) {
	try {
		publish(dayId, liveSnapshot(db, dayId, now));
	} catch (err) {
		console.error('live publish failed', err);
	}
}

export function getLive(db: DB, dayId: number): LiveState {
	return readState(db, dayId);
}

export function dispatch(db: DB, dayId: number, action: LiveAction, clientVersion: number, now: number = Date.now()): DispatchResult {
	const result = db.transaction((tx): DispatchResult => {
		const state = readState(tx, dayId);
		if (clientVersion !== state.version) return { ok: false, reason: 'conflict', state };
		let items = itemRows(tx, dayId);
		let logAction: string = action.type;
		let insertedId: number | null = null;

		if (action.type === 'insertQuickItem') {
			const title = typeof action.title === 'string' ? action.title.trim() : '';
			const dur = action.durationSec;
			if (title.length < 1 || title.length > 200 || !Number.isInteger(dur) || dur < 60 || dur > 86400) return { ok: false, reason: 'invalid', state };
			if (state.status !== 'running' && state.status !== 'held') return { ok: false, reason: 'invalid', state };
			const cur = items.findIndex((i) => i.id === state.currentItemId);
			if (cur < 0) return { ok: false, reason: 'invalid', state };
			insertedId = tx.insert(rosItems).values({
				dayId, position: cur + 1, title, durationSec: action.durationSec, type: 'other'
			}).returning({ id: rosItems.id }).get().id;
			const order = items.map((i) => i.id);
			order.splice(cur + 1, 0, insertedId);
			order.forEach((id, i) => tx.update(rosItems).set({ position: i }).where(eq(rosItems.id, id)).run());
			items = itemRows(tx, dayId);
			logAction = 'insert';
		}

		// The inserted item is current after the insert, i.e. it is "next" from the old current item.
		const r = applyAction(state, items.map((i) => i.id), insertedId !== null ? { type: 'next' } : action, now);
		if ('error' in r) return { ok: false, reason: r.error, state };
		saveState(tx, dayId, r.state);
		// Log the item that became current; for hold/resume/finish, the item the action applied to.
		const touchesCurrent = action.type === 'hold' || action.type === 'resume' || action.type === 'finish';
		log(tx, dayId, logAction, touchesCurrent ? state.currentItemId : r.state.currentItemId, now);
		return { ok: true, state: r.state };
	});
	if (result.ok) safePublish(db, dayId, now);
	return result;
}

/** Moves live state off a deleted current item. Returns true if state changed. Runs in the caller's transaction. */
function moveOffDeleted(c: Conn, dayId: number, itemId: number, successorId: number | null, now: number): boolean {
	const s = readState(c, dayId);
	if ((s.status !== 'running' && s.status !== 'held') || s.currentItemId !== itemId) return false;
	const next: LiveState = successorId === null
		? { status: 'finished', currentItemId: null, currentStartedAt: null, heldAt: null, version: s.version + 1 }
		: { status: s.status, currentItemId: successorId, currentStartedAt: now, heldAt: s.status === 'held' ? now : null, version: s.version + 1 };
	saveState(c, dayId, next);
	log(c, dayId, 'item_deleted', successorId, now);
	return true;
}

/**
 * If the deleted item was current, move to the next item by position (started now), or finish if none.
 * `successorId` is the item that followed it in position order (null if it was last); it must be captured before deletion.
 * Publishes if live state changed.
 */
export function onItemDeleted(db: DB, dayId: number, itemId: number, successorId: number | null, now: number = Date.now()): void {
	const changed = db.transaction((tx) => moveOffDeleted(tx, dayId, itemId, successorId, now));
	if (changed) safePublish(db, dayId, now);
}

/** Delete a run-of-show item and keep live state valid, atomically. Returns { dayId } or null if the item did not exist. */
export function deleteItemLive(db: DB, itemId: number, now: number = Date.now()): { dayId: number } | null {
	const it = getItem(db, itemId);
	if (!it) return null;
	const changed = db.transaction((tx) => {
		const ids = itemRows(tx, it.dayId).map((i) => i.id);
		const successor = ids[ids.indexOf(itemId) + 1] ?? null;
		deleteItem(tx as unknown as DB, itemId);
		return moveOffDeleted(tx, it.dayId, itemId, successor, now);
	});
	if (changed) safePublish(db, it.dayId, now);
	return { dayId: it.dayId };
}

/** Local wall-clock epoch for `min` minutes after midnight of `date` (Date normalises overflow and DST). */
function epoch(date: string, min: number): number {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(y, m - 1, d, 0, min).getTime();
}

export function liveSnapshot(db: DB, dayId: number, now: number = Date.now()): LiveSnapshot {
	const state = readState(db, dayId);
	const day = db.select().from(eventDays).where(eq(eventDays.id, dayId)).get();
	const timed = day ? computeTimes(day.startTime, itemRows(db, dayId)) : [];
	const empty: LiveSnapshot = { state, now: null, next: null, after: null, remainingSec: null, overUnderSec: 0 };
	if (!day) return empty;

	if (state.status === 'idle') return { ...empty, next: timed[0] ?? null, after: timed[1] ?? null };

	if (state.status === 'finished') {
		const fin = db.select().from(liveLog).where(eq(liveLog.dayId, dayId)).orderBy(asc(liveLog.id)).all().at(-1);
		const last = timed.at(-1);
		const over = fin && last ? Math.round((fin.at - epoch(day.date, last.endMin)) / 1000) : 0;
		return { ...empty, overUnderSec: over };
	}

	const idx = timed.findIndex((t) => t.id === state.currentItemId);
	if (idx < 0 || state.currentStartedAt === null) return empty;
	const cur = timed[idx];
	const ref = state.status === 'held' && state.heldAt !== null ? state.heldAt : now;
	const elapsedMs = ref - state.currentStartedAt;
	const durMs = cur.durationSec * 1000;
	// While held, the start slides forward with the hold so lateness keeps growing and matches the value after resume.
	const effStart = state.status === 'held' && state.heldAt !== null ? state.currentStartedAt + (now - state.heldAt) : state.currentStartedAt;
	const projectedEnd = effStart + Math.max(elapsedMs, durMs);
	return {
		state,
		now: cur,
		next: timed[idx + 1] ?? null,
		after: timed[idx + 2] ?? null,
		remainingSec: Math.round((durMs - elapsedMs) / 1000),
		overUnderSec: Math.round((projectedEnd - epoch(day.date, cur.endMin)) / 1000)
	};
}

export type ReportRow = {
	itemId: number;
	title: string;
	plannedStart: number;
	actualStart: number | null;
	plannedDurSec: number;
	actualDurSec: number | null;
};

const CHANGES = new Set(['start', 'next', 'back', 'skip', 'insert', 'item_deleted']);

export function report(db: DB, dayId: number): ReportRow[] {
	const day = db.select().from(eventDays).where(eq(eventDays.id, dayId)).get();
	if (!day) return [];
	const timed = computeTimes(day.startTime, itemRows(db, dayId));
	const rows = db.select().from(liveLog).where(eq(liveLog.dayId, dayId)).orderBy(asc(liveLog.id)).all();
	const spans = new Map<number, { start: number; end: number | null }>();
	let open: number | null = null;
	for (const r of rows) {
		const isChange = CHANGES.has(r.action);
		const becomes = isChange && r.itemId !== null;
		const ends = r.action === 'finish' || (isChange && r.itemId === null);
		if (open !== null && (ends || becomes)) {
			spans.get(open)!.end = r.at;
			open = null;
		}
		if (becomes) {
			spans.set(r.itemId!, { start: r.at, end: null }); // a revisited item (via back) reports its latest run
			open = r.itemId;
		}
	}
	return timed.map((t) => {
		const sp = spans.get(t.id);
		return {
			itemId: t.id,
			title: t.title,
			plannedStart: epoch(day.date, t.startMin),
			actualStart: sp ? sp.start : null,
			plannedDurSec: t.durationSec,
			actualDurSec: sp && sp.end !== null ? Math.round((sp.end - sp.start) / 1000) : null
		};
	});
}
