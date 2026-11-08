import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { can } from '#lib/server/auth/can.js';
import { getDb } from '#lib/server/db/index.js';
import { getEvent } from '#lib/server/events.js';
import { fieldErrors, formObject } from '#lib/server/forms.js';
import { requireActor } from '#lib/server/guard.js';
import {
	addSection, addTask, deleteSection, deleteTask, getSection, getTask, listTasksBySection, moveSection,
	ownerCandidates, renameSection, sectionIndex, setTaskStatus, taskInput, updateTask, TASK_STATUSES
} from '#lib/server/tasks.js';
import { addDays } from '#lib/server/util/dates.js';

const eventId = (p: { id: string }) => {
	const id = Number(p.id);
	if (!Number.isInteger(id) || id < 1) error(404, 'Event not found');
	return id;
};

export const load = ({ locals, params }) => {
	const id = eventId(params);
	const db = getDb();
	const actor = requireActor(locals, 'event:view', { eventId: id });
	const event = getEvent(db, id);
	if (!event) error(404, 'Event not found');
	return {
		eventStart: event.startDate,
		groups: listTasksBySection(db, id),
		owners: ownerCandidates(db, id),
		canEdit: can(db, actor, 'tasks:edit', { eventId: id }),
		meId: actor.kind === 'owner' || actor.kind === 'crew' ? actor.user.id : null
	};
};

const idOf = (v: unknown) => {
	const n = Number(v);
	return Number.isInteger(n) && n > 0 ? n : 0;
};

/** Auth + parse form + return helpers; every id used afterwards must be checked against the URL's event. */
function begin(locals: App.Locals, params: { id: string }) {
	const id = eventId(params);
	requireActor(locals, 'tasks:edit', { eventId: id });
	return { id, db: getDb() };
}

function ownSection(db: ReturnType<typeof getDb>, eid: number, raw: unknown) {
	const s = getSection(db, idOf(raw));
	if (!s || s.eventId !== eid) error(404, 'Section not found');
	return s;
}
function ownTask(db: ReturnType<typeof getDb>, eid: number, raw: unknown) {
	const t = getTask(db, idOf(raw));
	if (!t || t.eventId !== eid) error(404, 'Task not found');
	return t;
}

const sectionName = z.string().trim().min(1, 'Name is required').max(100);

/** Turn the due-date form fields into the value taskInput expects: absolute date, or "N days before start". */
function withDue(values: Record<string, string>, eventStart: string): Record<string, string> {
	if (values.dueMode === 'before') {
		const n = values.dueBefore?.trim() ?? '';
		if (n === '') return { ...values, dueDate: '' };
		if (!/^\d{1,4}$/.test(n)) return { ...values, dueDate: 'invalid' };
		return { ...values, dueDate: addDays(eventStart, -Number(n)) };
	}
	return values;
}

function parseTask(values: Record<string, string>, owners: { id: number }[], eventStart: string, currentOwner: number | null = null) {
	const parsed = taskInput.safeParse(withDue(values, eventStart));
	if (!parsed.success) return { errors: fieldErrors(parsed.error) } as const;
	if (parsed.data.ownerUserId !== null && parsed.data.ownerUserId !== currentOwner && !owners.some((o) => o.id === parsed.data.ownerUserId)) {
		return { errors: { ownerUserId: 'Choose someone assigned to this event' } } as const;
	}
	return { data: parsed.data } as const;
}

export const actions = {
	addSection: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		const n = sectionName.safeParse(values.name);
		if (!n.success) return fail(400, { form: 'addSection', errors: { name: n.error.issues[0].message }, values });
		addSection(db, id, n.data);
		return { form: 'addSection', saved: true };
	},
	renameSection: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		const s = ownSection(db, id, values.sectionId);
		const n = sectionName.safeParse(values.name);
		if (!n.success) return fail(400, { form: `section${s.id}`, errors: { name: n.error.issues[0].message }, values });
		renameSection(db, s.id, n.data);
		return { form: `section${s.id}`, saved: true };
	},
	moveSection: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		const s = ownSection(db, id, values.sectionId);
		const dir = z.enum(['up', 'down']).safeParse(values.dir);
		if (!dir.success) return fail(400, { form: `section${s.id}`, errors: { dir: 'Invalid direction' }, values });
		moveSection(db, s.id, sectionIndex(db, s.id) + (dir.data === 'up' ? -1 : 1));
		return { form: `section${s.id}`, saved: true };
	},
	deleteSection: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		deleteSection(db, ownSection(db, id, values.sectionId).id);
		return { form: 'deleteSection', saved: true };
	},
	addTask: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		const s = ownSection(db, id, values.sectionId);
		const event = getEvent(db, id)!;
		const r = parseTask(values, ownerCandidates(db, id), event.startDate);
		if ('errors' in r) return fail(400, { form: `addTask${s.id}`, errors: r.errors, values });
		addTask(db, id, s.id, r.data);
		return { form: `addTask${s.id}`, saved: true };
	},
	updateTask: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		const t = ownTask(db, id, values.taskId);
		const event = getEvent(db, id)!;
		const r = parseTask(values, ownerCandidates(db, id), event.startDate, t.ownerUserId);
		if ('errors' in r) return fail(400, { form: `task${t.id}`, errors: r.errors, values });
		updateTask(db, t.id, r.data);
		return { form: `task${t.id}`, saved: true };
	},
	setStatus: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		const t = ownTask(db, id, values.taskId);
		const st = z.enum(TASK_STATUSES).safeParse(values.status);
		if (!st.success) return fail(400, { form: `task${t.id}`, errors: { status: 'Invalid status' }, values });
		setTaskStatus(db, t.id, st.data);
		return { form: `task${t.id}`, saved: true };
	},
	deleteTask: async ({ locals, params, request }) => {
		const { id, db } = begin(locals, params);
		const values = formObject(await request.formData());
		deleteTask(db, ownTask(db, id, values.taskId).id);
		return { form: 'deleteTask', saved: true };
	}
};
