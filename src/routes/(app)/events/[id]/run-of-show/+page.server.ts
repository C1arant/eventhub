import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { can } from '#lib/server/auth/can.js';
import { getDb } from '#lib/server/db/index.js';
import { getEvent, listDays } from '#lib/server/events.js';
import { fieldErrors, formObject } from '#lib/server/forms.js';
import { requireActor } from '#lib/server/guard.js';
import {
	addItem, computeTimes, dayInEvent, deleteItem, itemIndex, itemInEvent, listItems, moveItem, reorderItems,
	ROS_TYPES, rosItemInput, updateItem
} from '#lib/server/ros.js';

const eventId = (p: { id: string }) => {
	const id = Number(p.id);
	if (!Number.isInteger(id) || id < 1) error(404, 'Event not found');
	return id;
};
const idOf = (v: unknown) => {
	const n = Number(v);
	return Number.isInteger(n) && n > 0 ? n : 0;
};

export const load = ({ locals, params, url }) => {
	const id = eventId(params);
	const db = getDb();
	const actor = requireActor(locals, 'ros:view', { eventId: id });
	if (!getEvent(db, id)) error(404, 'Event not found');
	const days = listDays(db, id);
	const wanted = url.searchParams.get('day');
	let day = days[0];
	if (wanted !== null) {
		day = dayInEvent(db, id, idOf(wanted))!;
		if (!day) error(404, 'Day not found');
	}
	return {
		days: days.map((d) => ({ id: d.id, label: d.label, date: d.date, startTime: d.startTime })),
		day: day ? { id: day.id, label: day.label, date: day.date, startTime: day.startTime } : null,
		items: day ? computeTimes(day.startTime, listItems(db, day.id)) : [],
		types: ROS_TYPES,
		canEdit: can(db, actor, 'ros:edit', { eventId: id })
	};
};

function begin(locals: App.Locals, params: { id: string }) {
	const id = eventId(params);
	requireActor(locals, 'ros:edit', { eventId: id });
	return { id, db: getDb() };
}

export const actions = {
	add: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		const day = dayInEvent(db, id, idOf(values.dayId));
		if (!day) error(404, 'Day not found');
		const p = rosItemInput.safeParse(values);
		if (!p.success) return fail(400, { form: 'add', errors: fieldErrors(p.error), values });
		addItem(db, day.id, p.data);
		return { form: 'add', saved: true };
	},
	update: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		const item = itemInEvent(db, id, idOf(values.itemId));
		if (!item) error(404, 'Item not found');
		const p = rosItemInput.safeParse(values);
		if (!p.success) return fail(400, { form: `item${item.id}`, errors: fieldErrors(p.error), values });
		updateItem(db, item.id, p.data);
		return { form: `item${item.id}`, saved: true };
	},
	move: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		const item = itemInEvent(db, id, idOf(values.itemId));
		if (!item) error(404, 'Item not found');
		const dir = z.enum(['up', 'down']).safeParse(values.dir);
		if (!dir.success) return fail(400, { form: `item${item.id}`, errors: { dir: 'Invalid direction' }, values });
		moveItem(db, item.id, itemIndex(db, item.id) + (dir.data === 'up' ? -1 : 1));
		return { form: `item${item.id}`, saved: true };
	},
	/** Drag-and-drop: the full new order of a day as a JSON array of item ids. */
	reorder: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		const day = dayInEvent(db, id, idOf(values.dayId));
		if (!day) error(404, 'Day not found');
		const parsed = z.array(z.number().int().positive()).max(1000).safeParse(safeJson(values.order));
		if (!parsed.success) return fail(400, { form: 'reorder', errors: { order: 'Invalid order' }, values });
		if (!reorderItems(db, day.id, parsed.data)) return fail(409, { form: 'reorder', errors: { order: 'The list changed; reload and try again' }, values });
		return { form: 'reorder', saved: true };
	},
	delete: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		const item = itemInEvent(db, id, idOf(values.itemId));
		if (!item) error(404, 'Item not found');
		deleteItem(db, item.id);
		return { form: 'delete', saved: true };
	}
};

function safeJson(s: unknown): unknown {
	try {
		return JSON.parse(String(s));
	} catch {
		return null;
	}
}
