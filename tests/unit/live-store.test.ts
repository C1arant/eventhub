import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/lib/server/db/index';
import { liveLog } from '../../src/lib/server/db/schema';
import { createTestDb } from '../../src/lib/server/db/test-db';
import { createEvent, eventInput, listDays } from '../../src/lib/server/events';
import { subscribe } from '../../src/lib/server/live/hub';
import { deleteItemLive, dispatch, getLive, liveSnapshot, notifyLive, report, resetLive } from '../../src/lib/server/live/store';
import { addItem, listItems, rosItemInput } from '../../src/lib/server/ros';

type D = ReturnType<typeof createTestDb>;
const T0 = new Date(2026, 2, 10, 20, 0).getTime(); // 2026-03-10 20:00 local
const DAY_START = new Date(2026, 2, 10, 19, 0).getTime();
const mk = (db: D, mins = [10, 10, 10]) => {
	const e = createEvent(db, eventInput.parse({ name: 'Show', type: 'club', startDate: '2026-03-10', endDate: '2026-03-10' }));
	const day = listDays(db, e)[0];
	const ids = mins.map((m, i) => addItem(db, day.id, rosItemInput.parse({ title: 'I' + i, durationMin: m })));
	return { dayId: day.id, ids };
};
const go = (db: D, dayId: number, type: string, now = T0, extra: object = {}) => {
	const v = getLive(db, dayId).version;
	return dispatch(db, dayId, { type, ...extra } as never, v, now);
};

describe('live store', () => {
	it('defaults to idle', () => {
		const db = createTestDb();
		const { dayId } = mk(db);
		expect(getLive(db, dayId)).toEqual({ status: 'idle', currentItemId: null, currentStartedAt: null, heldAt: null, version: 0 });
	});

	it('start on a day with no items is rejected (Review Focus 5)', () => {
		const db = createTestDb();
		const { dayId } = mk(db, []);
		const r = dispatch(db, dayId, { type: 'start' }, 0, T0);
		expect(r).toMatchObject({ ok: false, reason: 'empty' });
		expect(getLive(db, dayId).status).toBe('idle');
	});

	it('two dispatches with the same clientVersion: second conflicts, item advances once', () => {
		const db = createTestDb();
		const { dayId, ids } = mk(db);
		go(db, dayId, 'start');
		const v = getLive(db, dayId).version;
		const a = dispatch(db, dayId, { type: 'next' }, v, T0 + 1000);
		const b = dispatch(db, dayId, { type: 'next' }, v, T0 + 2000);
		expect(a.ok).toBe(true);
		expect(b).toMatchObject({ ok: false, reason: 'conflict' });
		expect(b.state.currentItemId).toBe(ids[1]);
		expect(getLive(db, dayId).currentItemId).toBe(ids[1]);
	});

	it('state survives reopening the DB file', () => {
		const dir = mkdtempSync(join(tmpdir(), 'eh-live-'));
		const path = join(dir, 'x.db');
		const db = openDb(path);
		const { dayId, ids } = mk(db);
		go(db, dayId, 'start');
		go(db, dayId, 'next', T0 + 1000);
		db.$client.close();
		const again = openDb(path);
		expect(getLive(again, dayId)).toMatchObject({ status: 'running', currentItemId: ids[1], currentStartedAt: T0 + 1000, version: 2 });
	});

	it('deleting the current item moves to the next (Review Focus 3)', () => {
		const db = createTestDb();
		const { dayId, ids } = mk(db);
		go(db, dayId, 'start');
		deleteItemLive(db, ids[0], T0 + 5000);
		expect(getLive(db, dayId)).toMatchObject({ status: 'running', currentItemId: ids[1], currentStartedAt: T0 + 5000, version: 2 });
		expect(listItems(db, dayId).map((i) => i.position)).toEqual([0, 1]);
	});

	it('deleting the current last item finishes (Review Focus 3)', () => {
		const db = createTestDb();
		const { dayId, ids } = mk(db);
		go(db, dayId, 'start');
		go(db, dayId, 'next');
		go(db, dayId, 'next');
		deleteItemLive(db, ids[2], T0 + 9000);
		expect(getLive(db, dayId)).toMatchObject({ status: 'finished', currentItemId: null });
	});

	it('deleting a non-current item leaves live state alone', () => {
		const db = createTestDb();
		const { dayId, ids } = mk(db);
		go(db, dayId, 'start');
		deleteItemLive(db, ids[2], T0);
		expect(getLive(db, dayId)).toMatchObject({ currentItemId: ids[0], version: 1 });
	});

	it('logs one row per applied action, none for rejected ones', () => {
		const db = createTestDb();
		const { dayId } = mk(db);
		go(db, dayId, 'start');
		go(db, dayId, 'hold', T0 + 1000);
		go(db, dayId, 'resume', T0 + 2000);
		dispatch(db, dayId, { type: 'back' }, getLive(db, dayId).version, T0 + 3000); // invalid on first item
		go(db, dayId, 'skip', T0 + 4000);
		const rows = db.select().from(liveLog).all();
		expect(rows.map((r) => r.action)).toEqual(['start', 'hold', 'resume', 'skip']);
	});

	it('insertQuickItem adds after current and advances to it', () => {
		const db = createTestDb();
		const { dayId } = mk(db);
		expect(go(db, dayId, 'insertQuickItem', T0, { title: 'Q', durationSec: 90 })).toMatchObject({ ok: false, reason: 'invalid' });
		go(db, dayId, 'start');
		const r = go(db, dayId, 'insertQuickItem', T0 + 1000, { title: 'Q', durationSec: 90 });
		expect(r.ok).toBe(true);
		const items = listItems(db, dayId);
		expect(items.map((i) => i.title)).toEqual(['I0', 'Q', 'I1', 'I2']);
		expect(items.map((i) => i.position)).toEqual([0, 1, 2, 3]);
		expect(items[1].durationSec).toBe(90);
		expect(r.state).toMatchObject({ currentItemId: items[1].id, currentStartedAt: T0 + 1000 });
		expect(db.select().from(liveLog).all().at(-1)).toMatchObject({ action: 'insert', itemId: items[1].id });
	});

	it('held remainingSec is frozen at the hold time', () => {
		const db = createTestDb();
		const { dayId } = mk(db, [10]);
		go(db, dayId, 'start', T0);
		go(db, dayId, 'hold', T0 + 60_000);
		expect(liveSnapshot(db, dayId, T0 + 600_000).remainingSec).toBe(540);
	});

	it('snapshot overUnderSec is 270 when an item started 4:30 late', () => {
		const db = createTestDb();
		const { dayId, ids } = mk(db, [10, 10]); // day starts 19:00 -> first item 19:00-19:10
		const late = DAY_START + 270_000;
		go(db, dayId, 'start', late);
		const s = liveSnapshot(db, dayId, late + 10_000);
		expect(s.overUnderSec).toBe(270);
		expect(s.now?.id).toBe(ids[0]);
		expect(s.next?.id).toBe(ids[1]);
		expect(s.after).toBeNull();
		expect(s.remainingSec).toBe(590);
	});

	it('overUnder grows once the item overruns; idle is 0', () => {
		const db = createTestDb();
		const { dayId } = mk(db, [10]);
		expect(liveSnapshot(db, dayId, T0).overUnderSec).toBe(0);
		go(db, dayId, 'start', DAY_START);
		const s = liveSnapshot(db, dayId, DAY_START + 15 * 60_000);
		expect(s.overUnderSec).toBe(300);
		expect(s.remainingSec).toBe(-300);
	});

	it('finished overUnder is finish time minus planned end of last item', () => {
		const db = createTestDb();
		const { dayId } = mk(db, [10]);
		go(db, dayId, 'start', DAY_START);
		go(db, dayId, 'next', DAY_START + 12 * 60_000);
		expect(liveSnapshot(db, dayId, DAY_START + 99 * 60_000).overUnderSec).toBe(120);
	});

	it('report lists actual starts and durations', () => {
		const db = createTestDb();
		const { dayId, ids } = mk(db);
		go(db, dayId, 'start', T0);
		go(db, dayId, 'next', T0 + 600_000);
		go(db, dayId, 'finish', T0 + 900_000);
		const r = report(db, dayId);
		expect(r.map((x) => [x.itemId, x.actualStart, x.actualDurSec, x.plannedDurSec])).toEqual([
			[ids[0], T0, 600, 600],
			[ids[1], T0 + 600_000, 300, 600],
			[ids[2], null, null, 600]
		]);
		expect(r[0].plannedStart).toBe(DAY_START);
	});

	it('publishes a snapshot after commit; a throwing subscriber is dropped and does not break others', () => {
		const db = createTestDb();
		const { dayId } = mk(db);
		const got: string[] = [];
		const un = subscribe(dayId, () => {
			throw new Error('boom');
		});
		const un2 = subscribe(dayId, (d) => got.push(d));
		go(db, dayId, 'start');
		go(db, dayId, 'next');
		expect(got).toHaveLength(2);
		expect(JSON.parse(got[0]).state.status).toBe('running');
		un();
		un2();
	});

	it('overUnder keeps growing while held and equals the value right after resume', () => {
		const db = createTestDb();
		const { dayId } = mk(db, [10]);
		go(db, dayId, 'start', DAY_START);
		go(db, dayId, 'hold', DAY_START + 120_000);
		expect(liveSnapshot(db, dayId, DAY_START + 120_000).overUnderSec).toBe(0);
		expect(liveSnapshot(db, dayId, DAY_START + 12 * 60_000).overUnderSec).toBe(600);
		expect(liveSnapshot(db, dayId, DAY_START + 17 * 60_000).overUnderSec).toBe(900);
		go(db, dayId, 'resume', DAY_START + 12 * 60_000);
		expect(liveSnapshot(db, dayId, DAY_START + 12 * 60_000).overUnderSec).toBe(600);
	});

	it('deleting the current item while held stays held, heldAt = now, and logs item_deleted', () => {
		const db = createTestDb();
		const { dayId, ids } = mk(db);
		go(db, dayId, 'start', T0);
		go(db, dayId, 'hold', T0 + 1000);
		deleteItemLive(db, ids[0], T0 + 5000);
		expect(getLive(db, dayId)).toMatchObject({ status: 'held', currentItemId: ids[1], currentStartedAt: T0 + 5000, heldAt: T0 + 5000 });
		expect(db.select().from(liveLog).all().at(-1)).toMatchObject({ action: 'item_deleted', itemId: ids[1], at: T0 + 5000 });
	});

	it('next while held resumes running on the next item', () => {
		const db = createTestDb();
		const { dayId, ids } = mk(db);
		go(db, dayId, 'start', T0);
		go(db, dayId, 'hold', T0 + 1000);
		go(db, dayId, 'next', T0 + 2000);
		expect(getLive(db, dayId)).toMatchObject({ status: 'running', currentItemId: ids[1], currentStartedAt: T0 + 2000, heldAt: null });
	});

	it('insertQuickItem validates its payload and writes nothing when rejected', () => {
		const db = createTestDb();
		const { dayId } = mk(db);
		go(db, dayId, 'start');
		for (const bad of [
			{ title: '   ', durationSec: 60 }, { title: 'x'.repeat(201), durationSec: 60 },
			{ title: 'ok', durationSec: 59 }, { title: 'ok', durationSec: 86401 }, { title: 'ok', durationSec: 90.5 }
		]) {
			expect(go(db, dayId, 'insertQuickItem', T0, bad)).toMatchObject({ ok: false, reason: 'invalid' });
		}
		expect(listItems(db, dayId)).toHaveLength(3);
		expect(getLive(db, dayId).version).toBe(1);
		expect(go(db, dayId, 'insertQuickItem', T0, { title: '  Trim me ', durationSec: 60 }).ok).toBe(true);
		expect(listItems(db, dayId)[1].title).toBe('Trim me');
	});
});

describe('notifyLive / resetLive', () => {
	it('notifyLive publishes for a running day and not for idle', () => {
		const db = createTestDb();
		const { dayId } = mk(db);
		const got: string[] = [];
		const un = subscribe(dayId, (d) => got.push(d));
		notifyLive(db, dayId, T0);
		expect(got).toHaveLength(0);
		go(db, dayId, 'start');
		got.length = 0;
		notifyLive(db, dayId, T0);
		expect(got).toHaveLength(1);
		expect(JSON.parse(got[0]).state.status).toBe('running');
		un();
	});

	it('resetLive clears state and log, publishes idle, and the day can be started again', () => {
		const db = createTestDb();
		const { dayId } = mk(db);
		const other = mk(db);
		go(db, dayId, 'start');
		go(db, dayId, 'next');
		go(db, other.dayId, 'start');
		const got: string[] = [];
		const un = subscribe(dayId, (d) => got.push(d));
		resetLive(db, dayId, T0);
		un();
		expect(getLive(db, dayId)).toMatchObject({ status: 'idle', version: 0 });
		expect(db.select().from(liveLog).all().filter((r) => r.dayId === dayId)).toHaveLength(0);
		expect(getLive(db, other.dayId).status).toBe('running');
		expect(got).toHaveLength(1);
		expect(JSON.parse(got[0]).state).toMatchObject({ status: 'idle', version: 0 });
		expect(go(db, dayId, 'start')).toMatchObject({ ok: true });
	});

	it('dispatch on a missing day is invalid, not empty', () => {
		const db = createTestDb();
		expect(dispatch(db, 99999, { type: 'start' }, 0, T0)).toMatchObject({ ok: false, reason: 'invalid' });
	});
});
