import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../src/lib/server/db/test-db';
import { createEvent, eventInput, listDays } from '../../src/lib/server/events';
import {
	addItem, computeTimes, dayInEvent, deleteItem, itemInEvent, listItems, moveItem, reorderItems, rosItemInput, updateItem
} from '../../src/lib/server/ros';

type D = ReturnType<typeof createTestDb>;
const mk = (db: D, name = 'Show') => {
	const e = createEvent(db, eventInput.parse({ name, type: 'club', startDate: '2026-03-10', endDate: '2026-03-10' }));
	return { e, day: listDays(db, e)[0] };
};
const inp = (o: Record<string, unknown> = {}) => rosItemInput.parse({ title: 'Item', durationMin: 10, ...o });

describe('computeTimes', () => {
	it('shows items past midnight as 00:30 (+1), in order (Review Focus 1)', () => {
		const db = createTestDb();
		const { day } = mk(db);
		for (const m of [90, 60, 60]) addItem(db, day.id, inp({ durationMin: m }));
		const t = computeTimes('22:00', listItems(db, day.id));
		expect(t.map((x) => x.clock)).toEqual(['22:00', '23:30', '00:30']);
		expect(t.map((x) => x.dayOffset)).toEqual([0, 0, 1]);
		expect(t.map((x) => x.startMin)).toEqual([1320, 1410, 1470]);
		expect(t.every((x) => !x.conflict)).toBe(true);
	});

	it('hard start 02:00 after a cursor of 01:30 lands the next day without conflict', () => {
		const db = createTestDb();
		const { day } = mk(db);
		addItem(db, day.id, inp({ durationMin: 150 })); // 23:00 -> 01:30
		addItem(db, day.id, inp({ hardStart: '02:00' }));
		const t = computeTimes('23:00', listItems(db, day.id));
		expect(t[1].clock).toBe('02:00');
		expect(t[1].dayOffset).toBe(1);
		expect(t[1].conflict).toBe(false);
	});

	it('hard start earlier than the cursor is a conflict', () => {
		const db = createTestDb();
		const { day } = mk(db);
		addItem(db, day.id, inp({ durationMin: 60 })); // 20:00 -> 21:00
		addItem(db, day.id, inp({ hardStart: '20:30' }));
		const t = computeTimes('20:00', listItems(db, day.id));
		expect(t[1].conflict).toBe(true);
		expect(t[1].clock).toBe('20:30');
	});
});

describe('ros items', () => {
	it('moveItem 0 -> 2 keeps positions contiguous', () => {
		const db = createTestDb();
		const { day } = mk(db);
		const ids = ['a', 'b', 'c', 'd'].map((title) => addItem(db, day.id, inp({ title })));
		moveItem(db, ids[0], 2);
		const items = listItems(db, day.id);
		expect(items.map((x) => x.title)).toEqual(['b', 'c', 'a', 'd']);
		expect(items.map((x) => x.position)).toEqual([0, 1, 2, 3]);
	});

	it('reorderItems applies a full order and rejects mismatched lists', () => {
		const db = createTestDb();
		const { day } = mk(db);
		const [a, b, c] = ['a', 'b', 'c'].map((title) => addItem(db, day.id, inp({ title })));
		expect(reorderItems(db, day.id, [c, a, b])).toBe(true);
		expect(listItems(db, day.id).map((x) => x.title)).toEqual(['c', 'a', 'b']);
		expect(reorderItems(db, day.id, [a, b])).toBe(false);
		expect(reorderItems(db, day.id, [a, a, b])).toBe(false);
		expect(reorderItems(db, day.id, [a, b, 9999])).toBe(false);
	});

	it('deleteItem renumbers and returns the dayId', () => {
		const db = createTestDb();
		const { day } = mk(db);
		const ids = ['a', 'b', 'c'].map((title) => addItem(db, day.id, inp({ title })));
		expect(deleteItem(db, ids[0])).toEqual({ dayId: day.id });
		expect(deleteItem(db, ids[0])).toBeNull();
		expect(listItems(db, day.id).map((x) => x.position)).toEqual([0, 1]);
	});

	it('stores minutes as seconds and validates input', () => {
		const db = createTestDb();
		const { day } = mk(db);
		const id = addItem(db, day.id, inp({ durationMin: '45' }));
		expect(listItems(db, day.id)[0].durationSec).toBe(2700);
		updateItem(db, id, inp({ title: 'Renamed', durationMin: 5, hardStart: '19:00' }));
		const row = listItems(db, day.id)[0];
		expect([row.title, row.durationSec, row.hardStart]).toEqual(['Renamed', 300, '19:00']);
		expect(rosItemInput.safeParse({ title: 'x', durationMin: 0 }).success).toBe(false);
		expect(rosItemInput.safeParse({ title: 'x', durationMin: 1441 }).success).toBe(false);
		expect(rosItemInput.safeParse({ title: 'x', durationMin: 5, hardStart: '25:00' }).success).toBe(false);
		expect(rosItemInput.safeParse({ title: 'x', durationMin: 5, type: 'nope' }).success).toBe(false);
		expect(rosItemInput.parse({ title: 'x', durationMin: 5, hardStart: '' }).hardStart).toBeNull();
	});

	it('itemInEvent / dayInEvent reject foreign ids', () => {
		const db = createTestDb();
		const a = mk(db, 'A');
		const b = mk(db, 'B');
		const item = addItem(db, a.day.id, inp());
		expect(itemInEvent(db, a.e, item)?.id).toBe(item);
		expect(itemInEvent(db, b.e, item)).toBeUndefined();
		expect(itemInEvent(db, a.e, 99999)).toBeUndefined();
		expect(dayInEvent(db, a.e, a.day.id)?.id).toBe(a.day.id);
		expect(dayInEvent(db, b.e, a.day.id)).toBeUndefined();
		expect(dayInEvent(db, a.e, Number.NaN)).toBeUndefined();
	});
});
